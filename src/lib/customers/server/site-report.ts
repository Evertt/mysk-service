/**
 * One site as its page and its report show it, to whoever may read it: the office (its tenant's
 * sites, by the customer's page) and a customer's contact (their customer's sites they see). The
 * caller passes the units' scope of its audience (`officeUnits()`, `customerUnits(access)`) and, for
 * the office, the customer the URL names (`where`), so a site of another customer, tenant or site a
 * contact doesn't see is a 404, also by a tampered id.
 */
import { and, eq, type SQL } from "drizzle-orm";

import { currentDay } from "#lib/dates.ts";
import { readUnits, type UnitAudience, type UnitScope } from "#lib/equipment/server/index.ts";
import { pendingOrderStatuses } from "#lib/models.ts";
import { isOneOf } from "#lib/one-of.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { customerSite, equipment } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";

import type { UnitFact } from "../extensions.ts";
import {
	eachOrder,
	isOpenFault,
	momentsOf,
	ordersAtSites,
	periodOf,
	readableSites,
	summarizeSites,
	within,
} from "./site-summary.ts";

/** The site `id`, if the viewer may read it and `where` (on `customerSite`) picks it; else a 404. */
async function readableSite(id: number, where?: SQL) {
	return orNotFound(
		await readableSites(and(eq(customerSite.id, id), where)),
		m.customers_site_not_found(),
	);
}

/** An order as the site's page and report list it, with whether it's a fault (a breakdown). */
const listed = (row: Awaited<ReturnType<typeof ordersAtSites>>[number]) => ({
	id: row.id,
	number: row.number,
	type: row.type,
	status: row.status,
	description: row.description,
	createdAt: row.createdAt,
	scheduledFor: row.scheduledFor,
	completedAt: row.completedAt,
	fault: row.type === "breakdown" || isOpenFault(row),
});

/** Newest first, by when it was made. */
const newestFirst = (a: { createdAt: Temporal.Instant }, b: { createdAt: Temporal.Instant }) =>
	Temporal.Instant.compare(b.createdAt, a.createdAt);

/**
 * The site's page: where it is, its figures (this month's so far), its units as the scope's
 * audience sees them, and its open work (orders still to be done, also reports awaiting
 * acceptance), newest first.
 */
export async function sitePage<A extends UnitAudience>(
	id: number,
	scope: UnitScope<A>,
	where?: SQL,
) {
	const site = await readableSite(id, where);
	const today = currentDay();
	const period = periodOf({}, today);
	const [units, rows, summary] = await Promise.all([
		readUnits(scope, eq(equipment.siteId, id)),
		ordersAtSites([id], period),
		summarizeSites({ siteIds: [id], period, today, units: false }),
	]);
	return {
		site,
		units,
		open: eachOrder(rows)
			.filter((row) => isOneOf(pendingOrderStatuses, row.status))
			.map(listed)
			.toSorted(newestFirst),
		figures: summary.figures.get(id) ?? [],
		watches: summary.watches,
	};
}

/**
 * The site's maintenance report over days `from` to `to` (`yyyy-mm-dd`; this month so far by
 * default, see `periodOf()`): the site and its customer, the figures (core's and the modules', by
 * section), each unit with the modules' facts about it (its condition, inspections, maintenance and
 * faults), and the orders made, scheduled or completed in the period.
 */
export async function siteReport<A extends UnitAudience>(
	id: number,
	input: { from?: string; to?: string },
	scope: UnitScope<A>,
	where?: SQL,
) {
	const site = await readableSite(id, where);
	const today = currentDay();
	const period = periodOf(input, today);
	const [units, rows, summary] = await Promise.all([
		readUnits(scope, eq(equipment.siteId, id)),
		ordersAtSites([id], period),
		summarizeSites({ siteIds: [id], period, today, units: true }),
	]);
	const moments = momentsOf(period);
	const inPeriod = (at: Temporal.Instant | null) => within(at, moments);
	return {
		organization: currentTenant().name,
		site,
		period,
		madeAt: Temporal.Now.instant(),
		figures: summary.figures.get(id) ?? [],
		columns: summary.columns.map(({ id: column, label }) => ({ id: column, label })),
		units: units.map((unit) => ({
			...unit,
			facts: Object.fromEntries(
				summary.columns.flatMap((column) => {
					const fact = column.cells.get(unit.id);
					return fact ? [[column.id, fact]] : [];
				}),
			) as Record<string, UnitFact>,
		})),
		orders: eachOrder(rows)
			.filter(
				(row) => inPeriod(row.createdAt) || inPeriod(row.completedAt) || inPeriod(row.scheduledFor),
			)
			.map(listed)
			.toSorted(newestFirst),
		watches: summary.watches,
	};
}
