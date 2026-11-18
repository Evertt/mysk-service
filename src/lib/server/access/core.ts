/**
 * The core's subject types' access rules, one entry each (a module's are in its
 * `server/access.ts`, see `#lib/access/extensions.ts`). The rules are the audience scopes that
 * exist, called from here: the office reads its tenant's records (`true`), a field engineer their
 * own orders (`engineerOrders()`) and every unit, a customer's contact their customer's records at
 * the sites they see (`customerOrders()`, `customerEquipment()`, `customerSites()`). The unit scopes
 * (`#lib/equipment/server/units.ts`) and the work record's (`work-record.ts`) read these rules back,
 * so the raw conditions are in `#lib/server/auth/`, which they all import without a cycle. A type an
 * audience has no entry for is one it doesn't read.
 *
 * - The tenant's settings (`order_type`, `equipment_category`, `module`, `simulation`) are read by
 *   those whose pages show them, and changed by managers.
 * - `member`, `invitation`, `portal_contact` and `integration_token` are for managers.
 * - A saved view is its owner's, or shared with the office (managers change those).
 * - An order's photo is seen by whoever reads the order, and deleted by the office, or by whoever
 *   added it (its engineer, the customer's contact) while the order is still to be done.
 * - A unit's document is read by whoever reads the unit, and changed by the office.
 */
import { and, eq, or, type SQL, sql } from "drizzle-orm";

import type { coreSubjectTypes } from "#lib/activity/subjects.ts";
import { pendingOrderStatuses } from "#lib/models.ts";
import {
	currentUser,
	customerEquipment,
	customerOrders,
	customerSites,
	engineerOrders,
	engineerSelf,
	engineerSites,
	idInTenant,
	inTenant,
} from "#lib/server/auth/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import {
	customer,
	customerSite,
	engineer,
	equipment,
	equipmentCategory,
	equipmentDocument,
	equipmentLocation,
	integrationToken,
	invitation,
	member,
	order,
	orderPhoto,
	portalContact,
	savedView,
} from "#lib/server/db/schema.ts";

import { type AccessRule, partOf, rows, tenantWide } from "./rules.ts";

/**
 * A location's rule: it's at a site the audience reads (`sites`, a condition on `customerSite`,
 * from the unit scopes), so its answer is its site's.
 */
const locationsAt = (sites: SQL) =>
	and(
		inTenant(equipmentLocation),
		sql`${equipmentLocation.siteId} in (select ${customerSite.id} from ${customerSite} where ${sites})`,
	)!;

/**
 * A photo the signed-in user added, of an order still to be done (awaiting acceptance, quoted,
 * planned or under way): not once it's completed, invoiced or cancelled.
 */
const ownWhilePending = () =>
	and(
		eq(orderPhoto.userId, currentUser().id),
		sql`${orderPhoto.orderId} in (select ${order.id} from ${order} where ${and(
			inTenant(order),
			inList(order.status, pendingOrderStatuses),
		)})`,
	)!;

/** A saved view the signed-in user may read: their own, or one shared with the office. */
const ownOrShared = () =>
	and(inTenant(savedView), or(eq(savedView.userId, currentUser().id), eq(savedView.shared, true)))!;

export const coreRules = {
	customer: rows(customer, customer.id, {
		office: true,
		engineer: true,
		customer: ({ access }) => idInTenant(customer, access.customer.id),
	}),
	site: rows(customerSite, customerSite.id, {
		office: true,
		engineer: () => engineerSites(),
		customer: ({ access }) => customerSites(access),
	}),
	engineer: rows(engineer, engineer.id, { office: true, engineer: () => engineerSelf() }),
	equipment: rows(equipment, equipment.id, {
		office: true,
		engineer: true,
		customer: ({ access }) => customerEquipment(access),
	}),
	location: rows(equipmentLocation, equipmentLocation.id, {
		office: true,
		engineer: true,
		customer: ({ access }) => locationsAt(customerSites(access)),
	}),
	equipment_category: rows(
		equipmentCategory,
		equipmentCategory.id,
		{ office: true, engineer: true, customer: true },
		{ change: "manager" },
	),
	order_type: tenantWide({ office: true, engineer: true, customer: true }, { change: "manager" }),
	order: rows(
		order,
		order.id,
		{
			office: true,
			engineer: () => engineerOrders(),
			customer: ({ access }) => customerOrders(access),
		},
		{ change: { office: true, engineer: () => engineerOrders() } },
	),
	// Whoever reads the order sees its photos: the office, its engineer, the customer's contact. The
	// office deletes any of an order (it changes them all); the others, of an order they read, the
	// ones they added while it's still to be done.
	order_photo: partOf(
		"order",
		orderPhoto,
		orderPhoto.orderId,
		{},
		{ engineer: ownWhilePending, customer: ownWhilePending },
	),
	// Whoever reads the unit reads its documents: the office, every engineer, the customer's contacts
	// who see its site. The office, which changes the unit, adds, renames and deletes them.
	equipment_document: partOf("equipment", equipmentDocument, equipmentDocument.equipmentId),
	module: tenantWide({ office: true }, { change: "manager" }),
	simulation: tenantWide({ office: true }, { change: "manager" }),
	member: rows(member, member.id, { office: "manager" }),
	invitation: rows(invitation, invitation.id, { office: "manager" }),
	portal_contact: rows(portalContact, portalContact.id, { office: "manager" }),
	integration_token: rows(integrationToken, integrationToken.id, { office: "manager" }),
	saved_view: rows(
		savedView,
		savedView.id,
		{ office: ownOrShared },
		{
			// Their own, and the shared ones too for a manager.
			change: {
				office: ({ manager }) =>
					manager
						? ownOrShared()
						: and(inTenant(savedView), eq(savedView.userId, currentUser().id)),
			},
		},
	),
} satisfies Record<keyof typeof coreSubjectTypes, AccessRule>;
