/**
 * The checklists module's part of a unit's timeline: each completed checklist of the unit, with as
 * many rejected points as its results have, and its order; a draft never shows.
 */
import { describe, expect, test } from "vite-plus/test";

import { getUnitTimeline } from "#lib/equipment/timeline/timeline.remote.ts";
import { as, data, north, organizationId, rows } from "#unit/lib/server/harness/index.ts";

describe("a unit's completed checklists on its timeline", () => {
	test("each with its outcome, as its results have it", async () => {
		const [found] = await rows<{ id: number; serial: string; number: string; rejected: number }>(
			`select c.id, e.serial_number as serial, o.number,
				(select count(*) from checklist_result r where r.checklist_id = c.id and r.result = 'nok') as rejected
			 from checklist c join equipment e on e.id = c.equipment_id join "order" o on o.id = c.order_id
			 where c.organization_id = ? and c.status = 'completed'
			 order by rejected desc, c.completed_at desc limit 1`,
			[organizationId("north")],
		);
		let before: { at: string; id: string } | undefined;
		let entry;
		for (let pages = 0; pages < 100 && !entry; pages++) {
			const page = await as(north.member, () =>
				data(getUnitTimeline, { serial: found.serial, before }),
			);
			entry = page.entries.find((each) => each.id === `checklist:${found.id}`);
			if (!page.next) break;
			before = { at: page.next.at.toString(), id: page.next.id };
		}
		expect(entry).toMatchObject({ kind: "checklist.completed", order: found.number });
		expect(entry?.detail).toBe(
			found.rejected
				? `${found.rejected} point${found.rejected === 1 ? "" : "s"} rejected`
				: "Every point approved",
		);
		const drafts = await rows<{ id: number }>(
			`select id from checklist where equipment_id = (select equipment_id from checklist where id = ?)
			 and status = 'draft'`,
			[found.id],
		);
		const page = await as(north.member, () => data(getUnitTimeline, { serial: found.serial }));
		for (const draft of drafts) {
			expect(page.entries.map((each) => each.id)).not.toContain(`checklist:${draft.id}`);
		}
	});
});
