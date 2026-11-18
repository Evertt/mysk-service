/**
 * The maintenance module's figures about customers' sites (`customers.siteSummary`): each site's
 * visits done in the period (its units' maintenance and inspection orders completed then), and its
 * active plans that are overdue or due within the tenant's lead days, and with `units` each unit's
 * last visit and next due date, for the report. Of the units, orders and plans the viewer may read
 * (`visible()`: a contact's, of the units they see).
 */
import { and, eq, gte, lt, max, min, type SQL, sql } from "drizzle-orm";

import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import type {
	SiteFigure,
	SiteSummary,
	SiteSummaryQuery,
	UnitColumn,
} from "#lib/customers/extensions.ts";
import { startOfDay } from "#lib/dates.ts";
import { formatDate } from "#lib/i18n/index.ts";
import { doneOrderStatuses } from "#lib/models.ts";
import { visibleOrNone } from "#lib/server/access/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment, order, orderUnit } from "#lib/server/db/schema.ts";

import { defaultLeadDays, planOrderTypes } from "../model.ts";
import { maintenancePlan, maintenanceSettings } from "./schema.ts";

/** Where its section comes in the report: after the inspections. */
const PLACE = 30;

/** How many days ahead a plan counts as due: the tenant's setting, without making its row. */
async function leadDays() {
	const [row] = await db
		.select({ leadDays: maintenanceSettings.leadDays })
		.from(maintenanceSettings)
		.where(inTenant(maintenanceSettings));
	return row?.leadDays ?? defaultLeadDays;
}

export async function maintenanceSiteSummary({
	siteIds,
	period,
	today,
	units,
}: SiteSummaryQuery): Promise<SiteSummary> {
	const unitsWhere: SQL = and(
		inTenant(equipment),
		await visibleOrNone("equipment"),
		inList(equipment.siteId, siteIds),
	)!;
	const visits = and(
		unitsWhere,
		await visibleOrNone("order"),
		inList(order.status, doneOrderStatuses),
		inList(order.type, planOrderTypes),
	);
	const [plans, done, last, ahead] = await Promise.all([
		db
			.select({
				equipmentId: equipment.id,
				siteId: equipment.siteId,
				nextDueOn: min(maintenancePlan.nextDueOn),
			})
			.from(maintenancePlan)
			.innerJoin(...tenantJoin(equipment, maintenancePlan.equipmentId))
			.where(
				and(unitsWhere, await visibleOrNone("maintenancePlan"), eq(maintenancePlan.paused, false)),
			)
			.groupBy(equipment.id),
		db
			.select({
				siteId: equipment.siteId,
				count: sql<number>`count(distinct ${order.id})`.mapWith(Number),
			})
			.from(order)
			.innerJoin(orderUnit, and(eq(orderUnit.orderId, order.id), inTenant(orderUnit)))
			.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
			.where(
				and(
					visits,
					gte(order.completedAt, startOfDay(period.from)),
					lt(order.completedAt, startOfDay(period.to.add({ days: 1 }))),
				),
			)
			.groupBy(equipment.siteId),
		units
			? db
					.select({ equipmentId: equipment.id, completedAt: max(order.completedAt) })
					.from(order)
					.innerJoin(orderUnit, and(eq(orderUnit.orderId, order.id), inTenant(orderUnit)))
					.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
					.where(visits)
					.groupBy(equipment.id)
			: [],
		leadDays(),
	]);

	const horizon = today.add({ days: ahead });
	/** A plan's next due date as overdue (before today), due (within the lead days) or neither. */
	const stateOf = (day: Temporal.PlainDate) =>
		Temporal.PlainDate.compare(day, today) < 0
			? "overdue"
			: Temporal.PlainDate.compare(day, horizon) <= 0
				? "due"
				: "later";
	const parsed = plans.flatMap((plan) =>
		plan.nextDueOn ? [{ ...plan, nextDueOn: Temporal.PlainDate.from(plan.nextDueOn) }] : [],
	);

	const section = m.maintenance_site_section();
	const doneAt = new Map(done.map((row) => [row.siteId, row.count]));
	const bySite = Map.groupBy(parsed, (plan) => plan.siteId);
	const figures = new Map<number, SiteFigure[]>();
	for (const siteId of siteIds) {
		const own = bySite.get(siteId) ?? [];
		const count = (state: string) => own.filter((plan) => stateOf(plan.nextDueOn) === state).length;
		const figure = (id: string, label: string, value: number): SiteFigure => ({
			id: `maintenance.${id}`,
			section,
			label,
			value,
			place: PLACE,
		});
		figures.set(siteId, [
			figure("done", m.maintenance_site_done(), doneAt.get(siteId) ?? 0),
			figure("due", m.maintenance_site_due(), count("due")),
			figure("overdue", m.maintenance_site_overdue(), count("overdue")),
		]);
	}

	const tones: Record<string, BadgeTone | undefined> = { overdue: "danger", due: "warning" };
	const columns: UnitColumn[] = units
		? [
				{
					id: "maintenance.last",
					label: m.maintenance_site_last(),
					place: PLACE,
					cells: new Map(
						last.flatMap((row) =>
							row.completedAt ? [[row.equipmentId, { text: formatDate(row.completedAt) }]] : [],
						),
					),
				},
				{
					id: "maintenance.next",
					label: m.maintenance_site_next(),
					place: PLACE + 1,
					cells: new Map(
						parsed.map((plan) => [
							plan.equipmentId,
							{ text: formatDate(plan.nextDueOn), tone: tones[stateOf(plan.nextDueOn)] },
						]),
					),
				},
			]
		: [];
	return { figures, columns, watches: ["maintenancePlan", "order"] };
}
