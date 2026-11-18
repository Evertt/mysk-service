/**
 * The condition module's part of a unit's timeline: each condition of the unit measured, with its
 * score and its defects, as its rows have them; its defects' photos for the office, never for the
 * customer's contact (who still reads the condition); and the unit's current score in its figures.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { getPortalUnitTimeline, getUnitTimeline } from "#lib/equipment/timeline/timeline.remote.ts";
import { as, data, organizationId, rows, shltr, value } from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");

/** A Riedel unit's condition (as a whole) with defects, and a photo of one of them. */
let found: { serial: string; condition: number; score: number; defects: number };
let photo: number;

beforeAll(async () => {
	[found] = await rows<typeof found>(
		`select e.serial_number as serial, c.id as condition, c.score,
			(select count(*) from condition_defect d where d.condition_id = c.id) as defects
		 from unit_condition c join equipment e on e.id = c.equipment_id
		 join customer k on k.id = e.customer_id
		 where c.organization_id = ? and c.component_id is null and k.name = 'Riedel B.V.'
			and exists (select 1 from condition_defect d where d.condition_id = c.id)
		 order by c.recorded_at desc limit 1`,
		[shltrId],
	);
	const defect = await value<number>(
		`select id from condition_defect where condition_id = ? order by position limit 1`,
		[found.condition],
	);
	await rows(
		`insert into condition_defect_photo
			(organization_id, equipment_id, defect_id, object_key, content_type, size, position)
		 values (?, (select equipment_id from unit_condition where id = ?), ?, 'x/condition/a.png', 'image/png', 10, 0)`,
		[shltrId, found.condition, defect],
	);
	photo = await value<number>(`select max(id) from condition_defect_photo`, []);
});

/** The condition's entry on the unit's timeline, page by page, as `read` reads it. */
async function entryOf(read: typeof getUnitTimeline) {
	let before: { at: string; id: string } | undefined;
	for (let pages = 0; pages < 400; pages++) {
		const page = await data(read, { serial: found.serial, before });
		const entry = page.entries.find((each) => each.id === `condition:${found.condition}`);
		if (entry) return entry;
		if (!page.next) return undefined;
		before = { at: page.next.at.toString(), id: page.next.id };
	}
}

describe("a unit's conditions on its timeline", () => {
	test("the office reads its score, defects and their photos", async () => {
		const entry = await as(shltr.member, () => entryOf(getUnitTimeline));
		expect(entry?.kind).toBe("condition.recorded");
		expect(entry?.title).toContain(`${found.score} · `);
		expect(entry?.title).toContain(`${found.defects} defect`);
		expect(entry?.photos).toEqual([{ id: photo, src: `/condition/photos/${photo}` }]);
	});

	test("the customer's contact reads the condition, never a defect's photo", async () => {
		const entry = await as(shltr.customer, () => entryOf(getPortalUnitTimeline));
		expect(entry?.kind).toBe("condition.recorded");
		expect(entry?.photos ?? []).toEqual([]);
	});

	test("its current score is a figure of the unit's", async () => {
		const page = await as(shltr.customer, () =>
			data(getPortalUnitTimeline, { serial: found.serial }),
		);
		const figure = page.figures?.find((each) => each.key === "condition.score");
		expect(figure?.value).toMatch(/^\d · /);
	});
});
