/**
 * A unit's inspection status, on the seeded demo database, as its page and the customer portal work
 * it out (`unitInspection()`) and as the equipment list and the condition module do in SQL
 * (`inspectionSql()`): the same, also when its newest completed inspection has no last valid day
 * (which completing one always sets), which both pass over.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vite-plus/test";

import { db } from "#lib/server/db/index.ts";
import { equipment } from "#lib/server/db/schema.ts";
import { getUnitChecklists } from "#modules/checklists/checklists.remote.ts";
import { inspectionSql } from "#modules/checklists/server/inspection-sql.ts";
import { as, data, organizationId, rows, shltr } from "#unit/lib/server/harness/index.ts";

/** The unit's status by its page and by the SQL, with the page's last valid day. */
const statuses = (unit: { id: number; serial: string }) =>
	as(shltr.member, async () => {
		const page = await data(getUnitChecklists, unit.serial);
		const [{ bucket }] = await db
			.select({ bucket: inspectionSql().bucket })
			.from(equipment)
			.where(eq(equipment.id, unit.id));
		return { page: page.status, sql: bucket, validUntil: page.validUntil?.toString() ?? null };
	});

describe("a unit's inspection status", () => {
	test("passes over a completed inspection without a last valid day, on its page and in SQL", async () => {
		// A unit with a dated inspection on record and a draft to complete after it.
		const [unit] = await rows<{ id: number; serial: string; draft: number; until: string }>(
			`select e.id, e.serial_number as serial, d.id as draft, c.valid_until as until
			 from checklist c join equipment e on e.id = c.equipment_id
			 join checklist d on d.equipment_id = c.equipment_id and d.status = 'draft'
			 where c.organization_id = ? and c.kind = 'inspection' and c.status = 'completed'
			 and c.valid_until is not null order by c.completed_at desc, c.id desc limit 1`,
			[organizationId("shltr")],
		);
		expect(unit).toBeDefined();
		const before = await statuses(unit);
		expect(before.page).not.toBe("none");
		expect(before.validUntil).toBe(unit.until);
		expect(before.sql).toBe(before.page);

		await rows(
			`update checklist set kind = 'inspection', status = 'completed', valid_until = null,
			 completed_at = unixepoch() + 60 where id = ?`,
			[unit.draft],
		);
		expect(await statuses(unit)).toEqual(before);
	});
});
