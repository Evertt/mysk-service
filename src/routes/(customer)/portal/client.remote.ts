/**
 * The customer portal's data: only the signed-in contact's customer's orders, units, sites and
 * locations, and of those at sites only the sites they see. Every function is gated by
 * `forCustomers`, and every lookup is scoped to the tenant and the customer (and its sites, see
 * `#lib/server/auth/customer.ts`), so another customer's record (or another tenant's) is a 404,
 * also by a tampered id or serial number. Of the office's records it shows what concerns the
 * customer: no prices, notes or other customers, and of the engineer only their first name.
 */
import { getRequestEvent } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, desc, eq, gte, isNotNull, type SQL } from "drizzle-orm";
import * as v from "valibot";

import { firstName } from "#lib/engineers/index.ts";
import { formatNumber } from "#lib/i18n/index.ts";
import { doneOrderStatuses, pendingOrderStatuses, reportUrgencies } from "#lib/models.ts";
import { onUnit, requestOrder } from "#lib/orders/server/index.ts";
import { id, text } from "#lib/schema.ts";
import {
	atSites,
	auth,
	currentCustomer,
	currentTenant,
	type CustomerAccess,
	customerOrders,
	inTenant,
	ofCustomer,
	seesSite,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { changedAt, watchChanges } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import {
	customerSite,
	engineer,
	equipment,
	equipmentCategory,
	equipmentLocation,
	order,
	orderRequest,
	orderSignoff,
	orderUnit,
} from "#lib/server/db/schema.ts";
import { forAnyone, forCustomers } from "#lib/server/remote-functions.ts";

/** Who is signed in, for the portal's header: their name, their customer and its supplier. */
export const getPortalMe = forCustomers.query(async () => {
	const { customer } = await currentCustomer();
	const { name, user } = currentTenant();
	return { name: user.name, customer: customer.name, organization: name };
});

// --- Orders --------------------------------------------------------------------------------

/** What the portal's lists show of an order, besides its units. */
const orderColumns = {
	id: order.id,
	number: order.number,
	type: order.type,
	status: order.status,
	priority: order.priority,
	description: order.description,
	createdAt: order.createdAt,
	scheduledFor: order.scheduledFor,
	completedAt: order.completedAt,
	/** Whether the customer reported it in the portal, and what the planner decided. */
	reportedBy: orderRequest.reporterName,
	decidedAt: orderRequest.decidedAt,
	rejectionReason: orderRequest.rejectionReason,
};

/** A unit as the portal shows it: what it's called, what it is and where. */
const unitColumns = {
	id: equipment.id,
	serialNumber: equipment.serialNumber,
	name: equipment.name,
	manufacturer: equipment.manufacturer,
	model: equipment.model,
	status: equipment.status,
	category: equipmentCategory.name,
	siteId: equipment.siteId,
	site: customerSite.name,
	locationId: equipment.locationId,
	location: equipmentLocation.name,
};

/** The customer's units for which `where` holds that the contact sees, with where they are. */
const unitsWhere = (access: CustomerAccess, where?: SQL) =>
	db
		.select(unitColumns)
		.from(equipment)
		.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
		.innerJoin(...tenantJoin(customerSite, equipment.siteId))
		.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId))
		.where(and(ofCustomer(access, equipment), atSites(access, equipment.siteId), where))
		.orderBy(
			asc(customerSite.name),
			asc(equipment.name),
			asc(equipment.manufacturer),
			asc(equipment.serialNumber),
		);

type PortalUnit = Awaited<ReturnType<typeof unitsWhere>>[number];

/** The units of these orders the contact sees, in their order, by order id. */
async function unitsOfOrders(access: CustomerAccess, orderIds: number[]) {
	const units = new Map<number, PortalUnit[]>(orderIds.map((orderId) => [orderId, []]));
	if (!orderIds.length) return units;
	const rows = await db
		.select({ orderId: orderUnit.orderId, ...unitColumns })
		.from(orderUnit)
		.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
		.innerJoin(...tenantJoin(customerSite, equipment.siteId))
		.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId))
		.where(
			and(
				inList(orderUnit.orderId, orderIds),
				inTenant(orderUnit),
				eq(orderUnit.customerId, access.customer.id),
				atSites(access, equipment.siteId),
			),
		)
		.orderBy(asc(orderUnit.orderId), asc(orderUnit.position));
	for (const { orderId, ...unit } of rows) units.get(orderId)?.push(unit);
	return units;
}

/** The customer's orders that `where` picks and the contact sees, newest first, with their units. */
async function ordersWhere(access: CustomerAccess, where?: SQL, limit = 200) {
	const rows = await db
		.select(orderColumns)
		.from(order)
		.leftJoin(
			orderRequest,
			and(
				eq(orderRequest.orderId, order.id),
				eq(orderRequest.organizationId, order.organizationId),
			),
		)
		.where(and(customerOrders(access), where))
		.orderBy(desc(order.createdAt), desc(order.id))
		.limit(limit);
	const units = await unitsOfOrders(
		access,
		rows.map((row) => row.id),
	);
	return rows.map((row) => ({ ...row, units: units.get(row.id) ?? [] }));
}

/** How long a rejected report stays on the home page, so the customer sees the outcome. */
const RECENTLY_REJECTED_DAYS = 30;

/**
 * The portal's home: the customer's orders still to be done (also those not accepted yet) and
 * the reports rejected lately, and the work orders of the latest completed work.
 */
export const getPortalHome = forCustomers.query(async () => {
	const access = await currentCustomer();
	const since = Temporal.Now.instant().subtract({ hours: 24 * RECENTLY_REJECTED_DAYS });
	const [open, rejected, done] = await Promise.all([
		ordersWhere(access, inList(order.status, pendingOrderStatuses)),
		ordersWhere(access, and(eq(order.status, "cancelled"), rejectedSince(since)), 20),
		ordersWhere(access, inList(order.status, doneOrderStatuses), 5),
	]);
	return { open: [...rejected, ...open], done };
});

/**
 * For a query on `order` joined to its request: rejected by a planner since `since`. A rejected
 * report has a reason; an order cancelled otherwise has none.
 */
const rejectedSince = (since: Temporal.Instant) =>
	and(isNotNull(orderRequest.rejectionReason), gte(orderRequest.decidedAt, since));

/** The customer's orders the contact sees, newest first (the latest 200). */
export const getPortalOrders = forCustomers.query(async () => {
	const access = await currentCustomer();
	return ordersWhere(access);
});

/**
 * One of the customer's orders the contact sees, by its number, or a 404: what it's about and
 * where it stands, its units (those at the contact's sites), who reported it and what the planner
 * decided, the engineer's first name, and once it's done its work order's sign-off.
 */
export const getPortalOrder = forCustomers.query(v.string(), async (number) => {
	const access = await currentCustomer();
	const [found] = await db
		.select({ ...orderColumns, engineer: engineer.name })
		.from(order)
		.leftJoin(
			orderRequest,
			and(
				eq(orderRequest.orderId, order.id),
				eq(orderRequest.organizationId, order.organizationId),
			),
		)
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(and(eq(order.number, number), customerOrders(access)));
	if (!found) error(404, m.client_order_not_found({ number }));
	const [units, signoff] = await Promise.all([
		unitsOfOrders(access, [found.id]),
		db
			.select({
				signerName: orderSignoff.signerName,
				signature: orderSignoff.signature,
				engineerName: orderSignoff.engineerName,
				engineerSignature: orderSignoff.engineerSignature,
				signedAt: orderSignoff.signedAt,
			})
			.from(orderSignoff)
			.where(and(eq(orderSignoff.orderId, found.id), inTenant(orderSignoff))),
	]);
	const { engineer: engineerName, ...rest } = found;
	return {
		order: {
			...rest,
			// Only who's coming, by their first name.
			engineer: engineerName ? firstName(engineerName) : null,
			units: units.get(found.id) ?? [],
		},
		signoff: signoff[0] ?? null,
	};
});

// --- Equipment and locations ---------------------------------------------------------------

/**
 * The customer's sites the contact sees, each with its locations and units (read-only), in the
 * order the office keeps them.
 */
export const getPortalSites = forCustomers.query(async () => {
	const access = await currentCustomer();
	const [sites, locations, units] = await Promise.all([
		db
			.select({
				id: customerSite.id,
				name: customerSite.name,
				address: customerSite.address,
				postalCode: customerSite.postalCode,
				city: customerSite.city,
			})
			.from(customerSite)
			.where(and(ofCustomer(access, customerSite), atSites(access, customerSite.id)))
			.orderBy(asc(customerSite.name)),
		db
			.select({
				id: equipmentLocation.id,
				name: equipmentLocation.name,
				siteId: equipmentLocation.siteId,
			})
			.from(equipmentLocation)
			.innerJoin(...tenantJoin(customerSite, equipmentLocation.siteId))
			.where(
				and(
					inTenant(equipmentLocation),
					ofCustomer(access, customerSite),
					atSites(access, equipmentLocation.siteId),
				),
			)
			.orderBy(asc(equipmentLocation.position)),
		unitsWhere(access),
	]);
	return sites.map((site) => ({
		...site,
		locations: locations.filter((location) => location.siteId === site.id),
		units: units.filter((unit) => unit.siteId === site.id),
	}));
});

/**
 * One of the customer's units the contact sees, by its serial number (or a 404): what it is,
 * where, and its orders (its service history), newest first.
 */
export const getPortalUnit = forCustomers.query(v.string(), async (serialNumber) => {
	const access = await currentCustomer();
	const [unit] = await unitsWhere(access, eq(equipment.serialNumber, serialNumber));
	if (!unit) error(404, m.client_unit_not_found({ serial: serialNumber }));
	const orders = await ordersWhere(access, onUnit(unit.id), 50);
	return { unit, orders };
});

/** One of the customer's locations the contact sees (or a 404), its site and its units. */
export const getPortalLocation = forCustomers.query(id(), async (locationId) => {
	const access = await currentCustomer();
	const [location] = await db
		.select({
			id: equipmentLocation.id,
			name: equipmentLocation.name,
			description: equipmentLocation.description,
			siteId: equipmentLocation.siteId,
			site: customerSite.name,
		})
		.from(equipmentLocation)
		.innerJoin(...tenantJoin(customerSite, equipmentLocation.siteId))
		.where(
			and(
				eq(equipmentLocation.id, locationId),
				inTenant(equipmentLocation),
				ofCustomer(access, customerSite),
				atSites(access, equipmentLocation.siteId),
			),
		);
	if (!location) error(404, m.client_location_not_found());
	const units = await unitsWhere(access, eq(equipment.locationId, location.id));
	return { location, units };
});

// --- Reporting a breakdown -----------------------------------------------------------------

/** The longest description of a breakdown a customer can write. */
const MAX_DESCRIPTION = 2000;

/**
 * Reports a breakdown of one of the customer's units the contact sees: a `breakdown` order with
 * the urgency as its priority, awaiting acceptance by a planner (`requestOrder()`), logged as
 * created by them. Then to its page in the portal.
 */
export const reportBreakdown = forCustomers.form(
	v.object({
		unitId: id(m.client_report_unit_required),
		description: text(m.client_report_description_required),
		urgency: v.picklist(reportUrgencies, m.client_report_urgency_required),
	}),
	async (input, issue) => {
		const access = await currentCustomer();
		if (input.description.length > MAX_DESCRIPTION) {
			invalid(
				issue.description(
					m.client_report_description_too_long({ max: formatNumber(MAX_DESCRIPTION) }),
				),
			);
		}
		const [unit] = await db
			.select({ id: equipment.id, siteId: equipment.siteId })
			.from(equipment)
			.where(and(eq(equipment.id, input.unitId), ofCustomer(access, equipment)));
		if (!unit || !seesSite(access, unit.siteId)) {
			invalid(issue.unitId(m.client_report_unit_unknown()));
		}
		const created = await db.transaction((tx) =>
			requestOrder(tx, {
				customerId: access.customer.id,
				units: [unit.id],
				type: "breakdown",
				priority: input.urgency,
				description: input.description,
			}),
		);
		void getPortalHome().refresh();
		void getPortalOrders().refresh();
		redirect(303, `/portal/orders/${encodeURIComponent(created.number)}?reported`);
	},
);

// --- Live ----------------------------------------------------------------------------------

/** The records the portal shows: a change to any of them may outdate it. */
const portalSubjects = ["order", "customer", "site", "equipment", "location"] as const;

/**
 * When the records the portal shows last changed (epoch ms, 0 if not since the server started),
 * sent again on each change, so an open portal shows a planner accepting, rejecting or planning
 * an order without a reload. Any change of those types in the tenant: it says only that something
 * changed, and the queries it has the portal refresh are gated and scoped again.
 */
export const watchPortal = forCustomers.query.live(async function* () {
	const { organizationId } = currentTenant();
	const changes = watchChanges(organizationId, portalSubjects);
	getRequestEvent().request.signal.addEventListener("abort", changes.stop, { once: true });
	try {
		yield changedAt(organizationId, portalSubjects);
		for await (const _ of changes) yield changedAt(organizationId, portalSubjects);
	} finally {
		changes.stop();
	}
});

/** Signs out, back to the login page. */
export const signOut = forAnyone.form(async () => {
	await auth.api.signOut({ headers: getRequestEvent().request.headers });
	redirect(303, "/login");
});
