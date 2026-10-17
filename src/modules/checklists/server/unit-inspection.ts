import { eq } from "drizzle-orm";

import { getTimeZone } from "#lib/dates.ts";

import { inspectionStatus, rejections } from "../model.ts";
import { checklistRecords } from "./records.ts";
import { checklist } from "./schema.ts";

/**
 * The checklists of the tenant's unit `unitId` (found by the caller, in its scope), newest first,
 * and its inspection status today, by its latest completed inspection. The office's unit page and
 * the customer portal's both read it.
 */
export async function unitInspection(unitId: number) {
	const records = await checklistRecords(eq(checklist.equipmentId, unitId));
	const dated = records
		.map((record) => ({
			...record,
			date: record.completedAt ?? record.order.scheduledFor ?? record.createdAt,
		}))
		.toSorted((a, b) => Temporal.Instant.compare(b.date, a.date) || b.id - a.id);
	const latest = dated.find(
		(record) => record.kind === "inspection" && record.status === "completed",
	);
	const today = Temporal.Now.plainDateISO(getTimeZone());
	return {
		status: inspectionStatus(
			latest?.validUntil
				? { validUntil: latest.validUntil, rejected: rejections(latest.results) > 0 }
				: null,
			today,
		),
		validUntil: latest?.validUntil ?? null,
		checklists: dated,
	};
}
