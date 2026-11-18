/**
 * The checklists module's figures about customers' sites (`customers.siteSummary`): each site's units
 * by inspection status (`inspectionSql()`: expired and due within `EXPIRING_DAYS` as chips on its
 * card, rejected and valid), the inspections completed in the period, and with `units` each unit's
 * last inspection and until when it holds, for the report. Of the units the viewer may read
 * (`visible("equipment")`) and, for the inspections done, the checklists they may read
 * (`visible("checklist")`: a contact's once completed).
 */
import { and, desc, eq, gte, isNotNull, lt, type SQL, sql } from "drizzle-orm";

import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import type {
	SiteFigure,
	SiteSummary,
	SiteSummaryQuery,
	UnitColumn,
} from "#lib/customers/extensions.ts";
import { startOfDay } from "#lib/dates.ts";
import { formatDate } from "#lib/i18n/index.ts";
import { visibleOrNone } from "#lib/server/access/index.ts";
import { inTenant, sameTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";

import { inspectionSql } from "./inspection-sql.ts";
import { checklist } from "./schema.ts";

/** Where its section comes in the report: after the condition's. */
const PLACE = 20;

/** An inspection status as a cell's tone. */
const statusTone: Record<string, BadgeTone | undefined> = {
	expired: "danger",
	rejected: "warning",
	expiring: "warning",
	valid: "success",
};

export async function checklistSiteSummary({
	siteIds,
	period,
	today,
	units,
}: SiteSummaryQuery): Promise<SiteSummary> {
	const inspection = inspectionSql(today);
	const unitsWhere: SQL = and(
		inTenant(equipment),
		await visibleOrNone("equipment"),
		inList(equipment.siteId, siteIds),
	)!;
	/** The unit's latest completed inspection's completion. */
	const lastDone = sql`(select ${checklist.completedAt} from ${checklist} where ${and(
		eq(checklist.equipmentId, equipment.id),
		sameTenant(checklist, equipment),
		sql`${checklist.kind} = 'inspection'`,
		sql`${checklist.status} = 'completed'`,
		isNotNull(checklist.validUntil),
	)} order by ${desc(checklist.completedAt)}, ${desc(checklist.id)} limit 1)`.mapWith(
		checklist.completedAt,
	);
	const [rows, done] = await Promise.all([
		db
			.select({
				id: equipment.id,
				siteId: equipment.siteId,
				latest: inspection.latest.mapWith((value: string | null) =>
					value === null ? null : (JSON.parse(value) as { status: string; until: string }),
				),
				lastDone,
			})
			.from(equipment)
			.where(unitsWhere),
		db
			.select({ siteId: equipment.siteId, count: sql<number>`count(*)`.mapWith(Number) })
			.from(checklist)
			.innerJoin(...tenantJoin(equipment, checklist.equipmentId))
			.where(
				and(
					unitsWhere,
					await visibleOrNone("checklist"),
					eq(checklist.kind, "inspection"),
					eq(checklist.status, "completed"),
					gte(checklist.completedAt, startOfDay(period.from)),
					lt(checklist.completedAt, startOfDay(period.to.add({ days: 1 }))),
				),
			)
			.groupBy(equipment.siteId),
	]);

	const section = m.checklists_site_section();
	const doneAt = new Map(done.map((row) => [row.siteId, row.count]));
	const bySite = Map.groupBy(rows, (row) => row.siteId);
	const figures = new Map<number, SiteFigure[]>();
	for (const siteId of siteIds) {
		const own = bySite.get(siteId) ?? [];
		if (!own.length) continue;
		const count = (status: string) => own.filter((row) => row.latest?.status === status).length;
		const figure = (id: string, label: string, value: number, chip?: BadgeTone): SiteFigure => ({
			id: `checklists.${id}`,
			section,
			label,
			value,
			place: PLACE,
			...(chip ? { chip } : {}),
		});
		figures.set(siteId, [
			figure("done", m.checklists_site_done(), doneAt.get(siteId) ?? 0),
			figure("valid", m.checklists_site_valid(), count("valid")),
			figure("due", m.checklists_site_due(), count("expiring"), "warning"),
			figure("expired", m.checklists_site_expired(), count("expired"), "danger"),
			figure("rejected", m.checklists_site_rejected(), count("rejected")),
		]);
	}

	const columns: UnitColumn[] = units
		? [
				{
					id: "checklists.last",
					label: m.checklists_site_last(),
					place: PLACE,
					cells: new Map(
						rows.flatMap((row) =>
							row.lastDone ? [[row.id, { text: formatDate(row.lastDone) }]] : [],
						),
					),
				},
				{
					id: "checklists.next",
					label: m.checklists_site_next(),
					place: PLACE + 1,
					cells: new Map(
						rows.flatMap((row) =>
							row.latest
								? [
										[
											row.id,
											{
												text: formatDate(Temporal.PlainDate.from(row.latest.until)),
												tone: statusTone[row.latest.status],
											},
										],
									]
								: [],
						),
					),
				},
			]
		: [];
	// A checklist is logged with its order as the parent.
	return { figures, columns, watches: ["checklist", "order", "equipment"] };
}
