/**
 * The core's subject types' access rules, one entry each (a module's are in its
 * `server/access.ts`, see `#lib/access/extensions.ts`). The rules are the audience scopes that
 * exist, called from here: the office reads its tenant's records (`true`), a field engineer their
 * own orders (`engineerOrders()`) and every unit (`engineerUnits()`), a customer's contact their
 * customer's records at the sites they see (`customerOrders()`, `customerUnits()`). A type an
 * audience has no entry for is one it doesn't read.
 *
 * - The tenant's settings (`order_type`, `equipment_category`, `module`, `simulation`) are read by
 *   those whose pages show them, and changed by managers.
 * - `member`, `invitation`, `portal_contact` and `integration_token` are for managers.
 * - A saved view is its owner's, or shared with the office (managers change those).
 */
import { and, eq, or, type SQL, sql } from "drizzle-orm";

import type { coreSubjectTypes } from "#lib/activity/subjects.ts";
import { customerUnits, engineerUnits } from "#lib/equipment/server/index.ts";
import {
	currentUser,
	customerOrders,
	engineerOrders,
	engineerSelf,
	idInTenant,
	inTenant,
} from "#lib/server/auth/index.ts";
import {
	customer,
	customerSite,
	engineer,
	equipment,
	equipmentCategory,
	equipmentLocation,
	integrationToken,
	invitation,
	member,
	order,
	portalContact,
	savedView,
} from "#lib/server/db/schema.ts";

import { type AccessRule, rows, tenantWide } from "./rules.ts";

/**
 * A location's rule: it's at a site the audience reads (`sites`, a condition on `customerSite`,
 * from the unit scopes), so its answer is its site's.
 */
const locationsAt = (sites: SQL) =>
	and(
		inTenant(equipmentLocation),
		sql`${equipmentLocation.siteId} in (select ${customerSite.id} from ${customerSite} where ${sites})`,
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
		engineer: () => engineerUnits().sites,
		customer: ({ access }) => customerUnits(access).sites,
	}),
	engineer: rows(engineer, engineer.id, { office: true, engineer: () => engineerSelf() }),
	equipment: rows(equipment, equipment.id, {
		office: true,
		engineer: () => engineerUnits().units,
		customer: ({ access }) => customerUnits(access).units,
	}),
	location: rows(equipmentLocation, equipmentLocation.id, {
		office: true,
		engineer: () => locationsAt(engineerUnits().sites),
		customer: ({ access }) => locationsAt(customerUnits(access).sites),
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
