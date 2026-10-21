/**
 * The customer portal's data: only the signed-in contact's customer's orders, units, sites and
 * locations, and of those at sites only the sites they see. Every function is gated by
 * `forCustomers`, and every lookup is scoped to the tenant and the customer (and its sites, see
 * `#lib/server/auth/customer.ts`), so another customer's record (or another tenant's) is a 404,
 * also by a tampered id or serial number. Of the office's records it shows what concerns the
 * customer: no prices, notes or other customers, and of the engineer only their first name.
 */
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, desc, eq, gte, isNotNull, type SQL } from "drizzle-orm";
import * as v from "valibot";

import { siteColumns } from "#lib/customers/server/index.ts";
import {
	customerUnits,
	readLocation,
	readLocations,
	readUnits,
	seenBy,
} from "#lib/equipment/server/index.ts";
import { formatNumber } from "#lib/i18n/index.ts";
import { doneOrderStatuses, pendingOrderStatuses, reportUrgencies } from "#lib/models.ts";
import {
	customerWork,
	listedUnitsOf,
	onUnit,
	readWorkRecord,
	requestOrder,
} from "#lib/orders/server/index.ts";
import { id, text } from "#lib/schema.ts";
import {
	currentCustomer,
	type CustomerAccess,
	customerOrders,
	sameTenant,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customerSite, equipment, order, orderRequest } from "#lib/server/db/schema.ts";
import { feedFor, liveFeed } from "#lib/server/live.ts";
import { orNotFound } from "#lib/server/records.ts";
import { forCustomers } from "#lib/server/remote-functions.ts";

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

/** Orders as the portal shows them, with their request if the customer reported them. */
const selectOrders = () =>
	db
		.select(orderColumns)
		.from(order)
		.leftJoin(
			orderRequest,
			and(eq(orderRequest.orderId, order.id), sameTenant(orderRequest, order)),
		);

/** The customer's orders that `where` picks and the contact sees, newest first, with their units. */
async function ordersWhere(access: CustomerAccess, where?: SQL, limit = 200) {
	const rows = await selectOrders()
		.where(and(customerOrders(access), where))
		.orderBy(desc(order.createdAt), desc(order.id))
		.limit(limit);
	const units = await listedUnitsOf(
		rows.map((row) => row.id),
		seenBy(await customerUnits(access)),
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
 * where it stands, who reported it and what the planner decided, and of its work record (see
 * `readWorkRecord()`) its units at the contact's sites, the engineer's first name and once it's
 * done its work order's sign-off.
 */
export const getPortalOrder = forCustomers.query(v.string(), async (number) => {
	const scope = await customerWork(await currentCustomer(), number);
	const [[found], record] = await Promise.all([
		selectOrders().where(scope.where),
		readWorkRecord(scope),
	]);
	if (!found || !record) error(404, m.client_order_not_found({ number }));
	const { engineer, units, signoff } = record;
	return { order: { ...found, engineer, units }, signoff };
});

// --- Equipment and locations ---------------------------------------------------------------

/**
 * The customer's sites the contact sees, each with its locations and units (read-only), in the
 * order the office keeps them.
 */
export const getPortalSites = forCustomers.query(async () => {
	const scope = await customerUnits(await currentCustomer());
	const [sites, locations, units] = await Promise.all([
		db
			.select(siteColumns.address)
			.from(customerSite)
			.where(scope.sites)
			.orderBy(asc(customerSite.name)),
		readLocations(scope),
		readUnits(scope),
	]);
	return sites.map((site) => ({
		...site,
		locations: locations.filter((location) => location.siteId === site.id),
		units: units.filter((unit) => unit.site.id === site.id),
	}));
});

/**
 * One of the customer's units the contact sees, by its serial number (or a 404): what it is,
 * where, and its orders (its service history), newest first.
 */
export const getPortalUnit = forCustomers.query(v.string(), async (serialNumber) => {
	const access = await currentCustomer();
	const unit = orNotFound(
		await readUnits(await customerUnits(access), eq(equipment.serialNumber, serialNumber)),
		m.client_unit_not_found({ serial: serialNumber }),
	);
	const orders = await ordersWhere(access, onUnit(unit.id), 50);
	return { unit, orders };
});

/** One of the customer's locations the contact sees (or a 404), its site and its units. */
export const getPortalLocation = forCustomers.query(id(), async (locationId) =>
	orNotFound(
		await readLocation(await customerUnits(await currentCustomer()), locationId),
		m.client_location_not_found(),
	),
);

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
		const [unit] = await readUnits(await customerUnits(access), eq(equipment.id, input.unitId));
		if (!unit) {
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

/**
 * The changes to what the portal shows, for the one live query a portal tab shares
 * (`provideChangeFeed()` in its layout), which tells the pages and cards that follow a record
 * (`refreshOnRecordChange()`, the lists `refreshOnActivity()`) when a planner accepts, rejects or
 * plans an order, or a unit moves. What it tells is what the contact may read (`feedFor()`: their
 * customer's records, at their sites if limited to some), without who made it; see `liveFeed()`
 * for its answers.
 */
export const watchPortalChanges = forCustomers.query.live(() =>
	liveFeed(["order", "customer", "site", "equipment", "location"], feedFor()),
);
