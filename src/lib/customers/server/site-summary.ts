/**
 * The sites' figures (`siteSummary`, `../extensions.ts`): core's own, the orders at each site (an
 * order is at a site through its units), and each module's, merged by site. Everything is read as
 * the viewer may read it (`#lib/server/access`): the sites the caller passes are ones they may read,
 * and core counts only the orders and units they may read there, as each module does its own.
 *
 * Core's figures, of the orders the viewer reads with a unit at the site:
 *
 * - open faults: a report awaiting acceptance, or a breakdown still to be done;
 * - scheduled today: planned, on the way or under way, for today (the viewer's day);
 * - on the way: an engineer on the way there now;
 * - in the period: faults reported (breakdowns made, not cancelled), faults resolved (breakdowns
 *   completed) and the average hours from report to completion, and the work done (any order
 *   completed).
 */
import { and, eq, gte, lt, or, type SQL, sql } from "drizzle-orm";

import type { ChangeType } from "#lib/activity/index.ts";
import { currentDay, startOfDay } from "#lib/dates.ts";
import { formatNumber } from "#lib/i18n/index.ts";
import {
	doneOrderStatuses,
	engineerWorkStatuses,
	isDoneOrder,
	type OrderStatus,
	type OrderType,
	openOrderStatuses,
	pendingOrderStatuses,
} from "#lib/models.ts";
import { isOneOf } from "#lib/one-of.ts";
import { visibleOrNone } from "#lib/server/access/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, customerSite, equipment, order, orderUnit } from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";
import { Refused } from "#lib/server/refused.ts";

import {
	type SiteFigure,
	type SitePeriod,
	type SiteSummary,
	type SiteSummaryQuery,
	siteSummary,
	type UnitColumn,
} from "../extensions.ts";
import { worstFirst } from "../sites/figures.ts";
import { siteColumns } from "./site-columns.ts";

/** The longest period a report covers, in days. */
const MAX_PERIOD_DAYS = 366;

/**
 * The period of days `from` to `to` (`yyyy-mm-dd`, as the report's URL has them): this month so far
 * by default, from its 1st to today (the viewer's). Refused when it ends before it starts or is
 * longer than `MAX_PERIOD_DAYS`.
 */
export function periodOf(input: { from?: string; to?: string }, today = currentDay()): SitePeriod {
	const from = input.from ? Temporal.PlainDate.from(input.from) : today.with({ day: 1 });
	const to = input.to ? Temporal.PlainDate.from(input.to) : today;
	const days = from.until(to).days + 1;
	if (days < 1 || days > MAX_PERIOD_DAYS) {
		throw new Refused(m.customers_report_period_invalid({ max: formatNumber(MAX_PERIOD_DAYS) }));
	}
	return { from, to };
}

/** The moments a period spans: from its first day's start up to (not including) the next's. */
export const momentsOf = ({ from, to }: SitePeriod) => ({
	start: startOfDay(from),
	end: startOfDay(to.add({ days: 1 })),
});

/** Whether the moment `at` (none: no) is in `[start, end)`. */
export const within = (
	at: Temporal.Instant | null,
	{ start, end }: { start: Temporal.Instant; end: Temporal.Instant },
) =>
	at !== null && Temporal.Instant.compare(at, start) >= 0 && Temporal.Instant.compare(at, end) < 0;

/** Whether an order is an open fault: a report awaiting acceptance, or a breakdown to be done. */
export const isOpenFault = (row: { type: OrderType; status: OrderStatus }) =>
	row.status === "awaiting_acceptance" ||
	(row.type === "breakdown" && isOneOf(openOrderStatuses, row.status));

/** A breakdown reported in the period: made then, and not cancelled. */
const reportedIn = (
	row: { type: OrderType; status: OrderStatus; createdAt: Temporal.Instant },
	moments: { start: Temporal.Instant; end: Temporal.Instant },
) => row.type === "breakdown" && row.status !== "cancelled" && within(row.createdAt, moments);

/** The record types core's figures are read from. */
const coreWatches: ChangeType[] = ["order", "equipment", "site", "location"];

/**
 * The sites the viewer may read (`visible("site")`) that `where` picks (on `customerSite`), with
 * their address and customer, by name.
 */
export async function readableSites(where?: SQL) {
	return db
		.select({
			...siteColumns.address,
			customer: { id: customer.id, code: customer.code, name: customer.name },
		})
		.from(customerSite)
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.where(and(await visibleOrNone("site"), where))
		.orderBy(customerSite.name, customerSite.id);
}

/**
 * The orders the viewer reads with a unit at one of `siteIds` that core's figures (or the report's
 * list) count: still to be done, or made, completed or scheduled in the period. A row per order and
 * unit at those sites.
 */
export async function ordersAtSites(siteIds: readonly number[], period: SitePeriod) {
	if (!siteIds.length) return [];
	const { start, end } = momentsOf(period);
	const inPeriod = (column: typeof order.createdAt | typeof order.completedAt) =>
		and(gte(column, start), lt(column, end));
	return db
		.select({
			id: order.id,
			number: order.number,
			type: order.type,
			status: order.status,
			description: order.description,
			createdAt: order.createdAt,
			completedAt: order.completedAt,
			scheduledFor: order.scheduledFor,
			siteId: equipment.siteId,
			equipmentId: equipment.id,
		})
		.from(order)
		.innerJoin(orderUnit, and(eq(orderUnit.orderId, order.id), inTenant(orderUnit)))
		.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.where(
			and(
				await visibleOrNone("order"),
				await visibleOrNone("equipment"),
				inList(equipment.siteId, siteIds),
				or(
					inList(order.status, pendingOrderStatuses),
					inPeriod(order.createdAt),
					inPeriod(order.completedAt),
					and(gte(order.scheduledFor, start), lt(order.scheduledFor, end)),
				),
			),
		);
}

type OrderAtSite = Awaited<ReturnType<typeof ordersAtSites>>[number];

/** Of `rows` (a row per order and unit), each order once. */
export const eachOrder = <T extends { id: number }>(rows: readonly T[]) => [
	...new Map(rows.map((row) => [row.id, row])).values(),
];

/** The average hours from a breakdown's report to its completion, of those resolved; 0 for none. */
function averageHours(resolved: readonly OrderAtSite[]) {
	if (!resolved.length) return 0;
	const total = resolved.reduce(
		(sum, row) => sum + row.createdAt.until(row.completedAt!).total({ unit: "hours" }),
		0,
	);
	return Math.round((total / resolved.length) * 10) / 10;
}

/** Core's figures about the sites, and with `units` the faults in the period of each unit. */
async function coreSummary({ siteIds, period, today, units }: SiteSummaryQuery) {
	const rows = await ordersAtSites(siteIds, period);
	const moments = momentsOf(period);
	const todays = momentsOf({ from: today, to: today });
	const section = m.customers_overview_section_work();
	const figure = (
		id: string,
		label: string,
		value: number,
		more: Partial<SiteFigure> = {},
	): SiteFigure => ({ id: `core.${id}`, section, label, value, place: 90, ...more });

	const figures = new Map<number, SiteFigure[]>();
	const bySite = Map.groupBy(rows, (row) => row.siteId);
	for (const siteId of siteIds) {
		const orders = eachOrder(bySite.get(siteId) ?? []);
		const count = (keep: (row: OrderAtSite) => boolean) => orders.filter(keep).length;
		const resolved = orders.filter(
			(row) =>
				row.type === "breakdown" && isDoneOrder(row.status) && within(row.completedAt, moments),
		);
		figures.set(siteId, [
			figure("openFaults", m.customers_overview_open_faults(), count(isOpenFault), {
				chip: "danger",
			}),
			figure(
				"onTheWay",
				m.customers_overview_on_the_way(),
				count((row) => row.status === "on_the_way"),
				{ chip: "info" },
			),
			figure(
				"scheduledToday",
				m.customers_overview_scheduled_today(),
				count(
					(row) => isOneOf(engineerWorkStatuses, row.status) && within(row.scheduledFor, todays),
				),
				{ chip: "info" },
			),
			figure(
				"faultsReported",
				m.customers_report_faults_reported(),
				count((row) => reportedIn(row, moments)),
			),
			figure("faultsResolved", m.customers_report_faults_resolved(), resolved.length),
			figure("resolveHours", m.customers_report_resolve_hours(), averageHours(resolved), {
				format: "hours",
			}),
			figure(
				"workDone",
				m.customers_report_work_done(),
				count((row) => isOneOf(doneOrderStatuses, row.status) && within(row.completedAt, moments)),
			),
		]);
	}

	const columns: UnitColumn[] = [];
	if (units) {
		const faults = new Map<number, number>();
		for (const row of rows) {
			if (reportedIn(row, moments))
				faults.set(row.equipmentId, (faults.get(row.equipmentId) ?? 0) + 1);
		}
		columns.push({
			id: "core.faults",
			label: m.customers_report_column_faults(),
			place: 90,
			cells: new Map(
				[...faults].map(([id, count]) => [
					id,
					{ text: formatNumber(count), tone: count ? "warning" : undefined },
				]),
			),
		});
	}
	return { figures, columns, watches: coreWatches } satisfies SiteSummary;
}

/**
 * Each site's figures, core's and the modules' (each in its place), the report's columns of the
 * units with `units`, and the record types they're read from. `query.siteIds` must be sites the
 * viewer may read (`readableSites()`).
 */
export async function summarizeSites(query: SiteSummaryQuery) {
	if (!query.siteIds.length)
		return { figures: new Map<number, SiteFigure[]>(), columns: [], watches: coreWatches };
	const [own, modules] = await Promise.all([coreSummary(query), collect(siteSummary, query)]);
	const answers = [own, ...modules];
	const figures = new Map(
		query.siteIds.map((id) => [
			id,
			answers
				.flatMap((answer) => answer.figures.get(id) ?? [])
				.toSorted((a, b) => a.place - b.place),
		]),
	);
	return {
		figures,
		columns: answers.flatMap((answer) => answer.columns).toSorted((a, b) => a.place - b.place),
		watches: [...new Set(answers.flatMap((answer) => answer.watches))],
	};
}

/** How many units the viewer reads at each of `siteIds`. */
async function unitCounts(siteIds: readonly number[]) {
	if (!siteIds.length) return new Map<number, number>();
	const counts = await db
		.select({ siteId: equipment.siteId, count: sql<number>`count(*)`.mapWith(Number) })
		.from(equipment)
		.where(and(await visibleOrNone("equipment"), inList(equipment.siteId, siteIds)))
		.groupBy(equipment.siteId);
	return new Map(counts.map((row) => [row.siteId, row.count]));
}

/**
 * The sites overview: the sites the viewer may read that `where` picks (on `customerSite`, e.g. a
 * customer's), each with its address, its units and its figures (this month's, so far), worst
 * first (`worstFirst()`), and the record types a page that shows them follows.
 */
export async function siteOverview(where?: SQL) {
	const sites = await readableSites(where);
	const siteIds = sites.map((site) => site.id);
	const today = currentDay();
	const [summary, units] = await Promise.all([
		summarizeSites({ siteIds, period: periodOf({}, today), today, units: false }),
		unitCounts(siteIds),
	]);
	return {
		sites: worstFirst(
			sites.map((site) => ({
				...site,
				units: units.get(site.id) ?? 0,
				figures: summary.figures.get(site.id) ?? [],
			})),
		),
		watches: summary.watches,
	};
}
