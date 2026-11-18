/**
 * Recording a unit's condition on NEN 2767's scale, on the seeded demo database: by a member in the
 * office (its defects stored with the scores the server works out, the record's the worst; a
 * component's defects also its own condition; photos stored and served; its status following, a
 * newer one taking its place); by a completed checklist (`checklists.completed`: its rejected points
 * the defects, with the grade and photos the engineer gave each, the unit's over all its points and
 * each component's over its own, score 1 without a rejection, none when nothing counts); the
 * engineer giving a rejected point its defect in the portal; and their advice on the condition
 * their checklist gave the unit. Another tenant's unit or component, a unit not on the order, another
 * engineer's order or point are a 404, also by tampered fields. The server side of
 * `condition.office.test.ts`, `condition.portal.test.ts` and `condition.tenancy.test.ts`, which keep
 * the cards and one tampered form.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { isHttpError } from "@sveltejs/kit";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";

import { db } from "#lib/server/db/index.ts";
import { getUnitCondition, recordCondition } from "#modules/condition/condition.remote.ts";
import {
	adviseFieldConditionForm,
	getFieldCondition,
	getFieldPointDefect,
	removeFieldPointPhoto,
	saveFieldPointDefectForm,
} from "#modules/condition/portal/field-condition.remote.ts";
import { recordChecklistConditions } from "#modules/condition/server/conditions.ts";
import { GET } from "#routes/(field)/(modules)/condition/photos/[id]/+server.ts";
import { startWork } from "#routes/(field)/my/portal.remote.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	shltr,
	signedOut,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const settings = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return { photosFolder: fs.mkdtempSync(path.join(os.tmpdir(), "condition-photos-")) };
});
vi.mock("#lib/server/files/settings.ts", () => ({ fileSettings: settings }));

afterAll(async () => {
	const { rmSync } = await import("node:fs");
	rmSync(settings.photosFolder, { recursive: true, force: true });
});

const [northId, southId, shltrId] = [
	organizationId("north"),
	organizationId("south"),
	organizationId("shltr"),
];
const lev = shltr.engineer;

const jpeg = (name = "veer.jpg") =>
	new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array<number>(16).fill(7)])], name, {
		type: "image/jpeg",
	});

/** The files in the photo store, under a tenant's conditions. */
const storedFiles = (organization: string) => {
	const folder = join(settings.photosFolder, organization, "conditions");
	return existsSync(folder) ? readdirSync(folder) : [];
};

/** The type of a condition as stored. */
interface StoredCondition {
	id: number;
	organization_id: string;
	component_id: number | null;
	score: number;
	legacy_percent: number | null;
	advice: string | null;
	source: string;
	order_id: number | null;
	engineer_id: number | null;
	user_id: string | null;
}

/** A unit's conditions as stored (as a whole, or also its components'), newest first. */
const conditionsOf = (equipmentId: number, components = false) =>
	rows<StoredCondition>(
		`select id, organization_id, component_id, score, legacy_percent, advice, source, order_id,
			engineer_id, user_id
		 from unit_condition where equipment_id = ? ${components ? "" : "and component_id is null"}
		 order by recorded_at desc, id desc`,
		[equipmentId],
	);

/** A condition's defects as stored, in their order, with how many photos each has. */
const defectsOf = (conditionId: number) =>
	rows<{
		component_id: number | null;
		description: string;
		severity: string;
		extent: number;
		intensity: string;
		score: number;
		checklist_point_id: number | null;
		photos: number;
	}>(
		`select component_id, description, severity, extent, intensity, score, checklist_point_id,
			(select count(*) from condition_defect_photo p where p.defect_id = d.id) as photos
		 from condition_defect d where condition_id = ? order by position`,
		[conditionId],
	);

/** `[component id, …]` pairs by their component, the unit's (none) first. */
const byElement = (a: (number | null)[], b: (number | null)[]) => (a[0] ?? 0) - (b[0] ?? 0);

const conditionCount = async () => Number(await value(`select count(*) from unit_condition`));

const userOf = (actor: Actor) =>
	value<string>(`select id from user where email = ?`, [actor.email]);

/** `/condition/photos/<id>` as `actor` (signed out if `null`): its status and type. */
async function photo(actor: Actor | null, id: string) {
	const run = async () => {
		try {
			const response = await GET({
				params: { id },
				route: { id: "/(field)/(modules)/condition/photos/[id]" },
			} as never);
			return { status: response.status, type: response.headers.get("content-type") };
		} catch (error) {
			if (isHttpError(error)) return { status: error.status, type: null };
			throw error;
		}
	};
	return actor ? as(actor, run) : signedOut(run);
}

/** A point of a completed checklist, as `checklists.completed` is told it. */
type Point = {
	id: number;
	templateItemId: number | null;
	result: "ok" | "nok" | "na";
	remark?: string;
};

/**
 * Completes, as far as the condition module is concerned, a checklist of `equipmentId` on
 * `orderId` with `points`: its hook in a transaction of Lev's request, as completing one runs it.
 */
const completed = (equipmentId: number, orderId: number, engineerId: number, points: Point[]) =>
	as(lev, () =>
		db.transaction((tx) =>
			recordChecklistConditions({
				tx,
				checklist: { id: 0, kind: "inspection", orderId, equipmentId, engineerId },
				points: points.map((point) => ({
					text: `Punt ${point.id}`,
					remark: point.remark ?? null,
					...point,
				})),
			}),
		),
	);

let levId: number;

beforeAll(async () => {
	levId = await value<number>(
		`select e.id from engineer e join user u on u.id = e.user_id where u.email = ? and e.organization_id = ?`,
		[lev.email, shltrId],
	);
});

describe("a member recording a unit's condition, in North", () => {
	let unit: { id: number; serial_number: string };

	beforeAll(async () => {
		[unit] = await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e where e.organization_id = ?
			 and e.status = 'operational'
			 and not exists (select 1 from checklist k where k.equipment_id = e.id)
			 and not exists (select 1 from unit_condition u where u.equipment_id = e.id)
			 and not exists (select 1 from order_unit ou join "order" o on o.id = ou.order_id
				where ou.equipment_id = e.id and o.status in ('scheduled', 'on_the_way', 'in_progress'))
			 order by e.id limit 1`,
			[northId],
		);
	});

	test("stores its defects with their scores, the worst its own, logged against the unit; a newer one takes its place", async () => {
		expect(unit, "North has a unit without a condition").toBeDefined();
		const serialNumber = unit.serial_number;
		expect((await as(north.owner, () => data(getUnitCondition, serialNumber))).history).toEqual([]);

		const answer = await as(north.owner, () =>
			submit(recordCondition, {
				serialNumber,
				componentId: "",
				defects: [
					{
						componentId: "",
						description: "Bodemrubber verweerd",
						severity: "slight",
						extent: "20",
						intensity: "advanced",
					},
					{
						componentId: "",
						description: " Onderste torsieveer gebroken ",
						severity: "severe",
						extent: "50",
						intensity: "advanced",
					},
				],
				advice: "Veerpakket vervangen (SD-001).",
			}),
		);
		expect(answer).toMatchObject({ status: 200 });
		const [recorded] = await conditionsOf(unit.id);
		expect(recorded).toEqual({
			id: expect.any(Number),
			organization_id: northId,
			component_id: null,
			// Alone 1 and 4; on one element, category 2 at 20% (1.2 points) and category 4 at 50% (30):
			// 31.2, so 5.
			score: 5,
			legacy_percent: null,
			advice: "Veerpakket vervangen (SD-001).",
			source: "office",
			order_id: null,
			engineer_id: null,
			user_id: await userOf(north.owner),
		});
		expect(await defectsOf(recorded.id)).toEqual([
			{
				component_id: null,
				description: "Bodemrubber verweerd",
				severity: "slight",
				extent: 20,
				intensity: "advanced",
				score: 1,
				checklist_point_id: null,
				photos: 0,
			},
			{
				component_id: null,
				description: "Onderste torsieveer gebroken",
				severity: "severe",
				extent: 50,
				intensity: "advanced",
				score: 4,
				checklist_point_id: null,
				photos: 0,
			},
		]);
		expect(
			await rows(
				`select action, subject_label, parent_id, note from activity
				 where subject_type = 'unitCondition' and subject_id = ?`,
				[String(recorded.id)],
			),
		).toEqual([
			{
				action: "recorded",
				subject_label: `${serialNumber} · 5/6`,
				parent_id: String(unit.id),
				note: "Veerpakket vervangen (SD-001).",
			},
		]);
		const critical = await as(north.owner, () => data(getUnitCondition, serialNumber));
		expect(critical).toMatchObject({ score: 5, status: "critical", concern: "critical" });
		expect(critical.history).toMatchObject([
			{
				score: 5,
				legacyPercent: null,
				source: "office",
				order: null,
				defects: [
					{ description: "Bodemrubber verweerd", score: 1, component: null, photos: [] },
					{ description: "Onderste torsieveer gebroken", score: 4 },
				],
			},
		]);

		// No defects: score 1.
		await as(north.owner, () => submit(recordCondition, { serialNumber }));
		const fine = await as(north.owner, () => data(getUnitCondition, serialNumber));
		expect(fine).toMatchObject({ score: 1, status: "ok" });
		expect(fine.history.map((condition) => condition.score)).toEqual([1, 5]);
	});

	test("refuses a defect without its grade or description, and a score sent along is ignored", async () => {
		const before = await conditionCount();
		const refused = await as(north.owner, () =>
			submit(recordCondition, {
				serialNumber: unit.serial_number,
				defects: [
					{ componentId: "", description: "", severity: "", extent: "0", intensity: "end" },
				],
			}),
		);
		expect(refused).toMatchObject({ status: 400 });
		const paths = (refused as { issues: { path: (string | number)[] }[] }).issues.map((issue) =>
			issue.path.join("."),
		);
		expect(paths).toEqual(
			expect.arrayContaining([
				"defects.0.description",
				"defects.0.severity",
				"defects.0.extent",
				"defects.0.intensity",
			]),
		);
		expect(await conditionCount()).toBe(before);

		await as(north.owner, () =>
			submit(recordCondition, {
				serialNumber: unit.serial_number,
				score: 1,
				defects: [
					{
						description: "Kapot",
						severity: "severe",
						extent: "85",
						intensity: "final",
						score: "1",
					},
				],
			}),
		);
		expect((await conditionsOf(unit.id))[0].score).toBe(6);
	});

	test("for another tenant's unit, or a component not the unit's, is a 404 and records nothing", async () => {
		const southern = await value<string>(
			`select serial_number from equipment where organization_id = ?
			 and serial_number not in (select serial_number from equipment where organization_id = ?)
			 order by id limit 1`,
			[southId, northId],
		);
		const theirs = await value<number>(
			`select id from component where organization_id = ? order by id limit 1`,
			[shltrId],
		);
		const defect = {
			description: "Gemanipuleerd",
			severity: "serious",
			extent: "20",
			intensity: "advanced",
		};
		const before = await conditionCount();
		await as(north.owner, async () => {
			expect(await call(getUnitCondition, southern)).toMatchObject({ status: 404 });
			expect(
				await submit(recordCondition, { serialNumber: southern, defects: [defect] }),
			).toMatchObject({ status: 404 });
			expect(
				await submit(recordCondition, {
					serialNumber: unit.serial_number,
					componentId: String(theirs),
				}),
			).toMatchObject({ status: 404 });
			// A defect on another tenant's component, with a photo: the photo goes again.
			expect(
				await submit(recordCondition, {
					serialNumber: unit.serial_number,
					defects: [{ ...defect, componentId: String(theirs), photos: [jpeg()] }],
				}),
			).toMatchObject({ status: 404 });
		});
		expect(await conditionCount()).toBe(before);
		expect(storedFiles(northId)).toEqual([]);
	});
});

describe("a member recording a unit's condition with components, in SHLTR", () => {
	/** Sectionaaldeur laaddok 07, with OC-1041 (the torsion springs) and OC-1042 (the cables). */
	let door: { id: number; serial_number: string };
	let springs: number;
	let cables: number;

	beforeAll(async () => {
		[door] = await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e join component k on k.equipment_id = e.id
			 where k.organization_id = ? and k.number = 'OC-1041'`,
			[shltrId],
		);
		const part = (number: string) =>
			value<number>(`select id from component where organization_id = ? and number = ?`, [
				shltrId,
				number,
			]);
		[springs, cables] = await Promise.all([part("OC-1041"), part("OC-1042")]);
	});

	test("gives the unit all its defects, and each component the defects on it, with their photos", async () => {
		const since = Number(await value(`select max(id) from unit_condition`));
		const answer = await as(shltr.member, () =>
			submit(recordCondition, {
				serialNumber: door.serial_number,
				componentId: "",
				defects: [
					{
						componentId: String(springs),
						description: "Veerbreuk",
						severity: "severe",
						extent: "20",
						intensity: "final",
						photos: [jpeg(), jpeg("tweede.jpg")],
					},
					{
						componentId: "",
						description: "Paneel gedeukt",
						severity: "slight",
						extent: "5",
						intensity: "initial",
					},
				],
				advice: "",
			}),
		);
		expect(answer).toMatchObject({ status: 200 });
		const made = (await conditionsOf(door.id, true)).filter((each) => each.id > since);
		expect(made.map((each) => [each.component_id, each.score]).toSorted(byElement)).toEqual(
			[
				[null, 4],
				[springs, 4],
			].toSorted(byElement),
		);
		const whole = made.find((each) => each.component_id === null)!;
		const own = made.find((each) => each.component_id === springs)!;
		expect(
			(await defectsOf(whole.id)).map((each) => [each.component_id, each.score, each.photos]),
		).toEqual([
			[springs, 4, 2],
			[null, 1, 0],
		]);
		expect(
			(await defectsOf(own.id)).map((each) => [each.component_id, each.score, each.photos]),
		).toEqual([[springs, 4, 2]]);
		// The same two files, kept once.
		expect(storedFiles(shltrId)).toHaveLength(2);
		// The cables have none of their own now.
		expect(
			(await conditionsOf(door.id, true)).some(
				(each) => each.id > since && each.component_id === cables,
			),
		).toBe(false);
		const shown = await as(shltr.member, () => data(getUnitCondition, door.serial_number));
		expect(shown.score).toBe(4);
		expect(shown.components.map((part) => part.number)).toEqual(
			expect.arrayContaining(["OC-1041", "OC-1042"]),
		);
		expect(shown.history[0].defects[0]).toMatchObject({
			description: "Veerbreuk",
			component: { id: springs, number: "OC-1041" },
			photos: [{ id: expect.any(Number) }, { id: expect.any(Number) }],
		});
	});

	test("of a component puts every defect on it", async () => {
		const since = Number(await value(`select max(id) from unit_condition`));
		await as(shltr.member, () =>
			submit(recordCondition, {
				serialNumber: door.serial_number,
				componentId: String(cables),
				defects: [
					{
						componentId: "",
						description: "Draadbreuk",
						severity: "serious",
						extent: "50",
						intensity: "advanced",
					},
				],
			}),
		);
		const made = (await conditionsOf(door.id, true)).filter((each) => each.id > since);
		expect(made.map((each) => [each.component_id, each.score])).toEqual([[cables, 3]]);
		expect((await defectsOf(made[0].id)).map((each) => each.component_id)).toEqual([cables]);
	});

	test("its photos are served to the office and the engineer of an order of the unit, a 404 to anyone else", async () => {
		const [shot] = await rows<{ id: number }>(
			`select p.id from condition_defect_photo p join condition_defect d on d.id = p.defect_id
			 where p.organization_id = ? and d.description = 'Veerbreuk' order by p.id limit 1`,
			[shltrId],
		);
		expect(await photo(shltr.member, String(shot.id))).toEqual({
			status: 200,
			type: "image/jpeg",
		});
		const levsUnit = await value<number>(
			`select count(*) from order_unit ou join "order" o on o.id = ou.order_id
			 where ou.equipment_id = ? and o.engineer_id = ?`,
			[door.id, levId],
		);
		expect((await photo(lev, String(shot.id))).status).toBe(levsUnit ? 200 : 404);
		expect((await photo(shltr.customer, String(shot.id))).status).toBe(404);
		expect((await photo(north.owner, String(shot.id))).status).toBe(404);
		expect((await photo(shltr.member, "0")).status).toBe(404);
		expect((await photo(shltr.member, "x1")).status).toBe(404);
		expect((await photo(null, String(shot.id))).status).toBe(401);
	});
});

describe("a completed checklist", () => {
	/** Sectionaaldeur laaddok 07 (OC-1041, two points; OC-1042, one), with an order of its. */
	let door: { id: number; order: number };
	let points: { springs: number[]; cables: number; other: number };
	let springs: number;
	let cables: number;

	beforeAll(async () => {
		[door] = await rows<{ id: number; order: number }>(
			`select e.id, (select ou.order_id from order_unit ou where ou.equipment_id = e.id
				order by ou.order_id desc limit 1) as "order"
			 from equipment e join component k on k.equipment_id = e.id
			 where k.organization_id = ? and k.number = 'OC-1041'`,
			[shltrId],
		);
		const checks = async (number: string) =>
			(
				await rows<{ id: number }>(
					`select cc.template_item_id as id from component_checkpoint cc
					 join component k on k.id = cc.component_id where k.organization_id = ? and k.number = ?
					 order by cc.template_item_id`,
					[shltrId, number],
				)
			).map((row) => row.id);
		const springPoints = await checks("OC-1041");
		const [cablePoint] = await checks("OC-1042");
		const other = await value<number>(
			`select i.id from checklist_template_item i join checklist_template t on t.id = i.template_id
			 where t.organization_id = ? and t.name = 'Sectionaaldeur'
			 and i.id not in (select template_item_id from component_checkpoint) order by i.position limit 1`,
			[shltrId],
		);
		points = { springs: springPoints, cables: cablePoint, other };
		const part = (number: string) =>
			value<number>(`select id from component where organization_id = ? and number = ?`, [
				shltrId,
				number,
			]);
		[springs, cables] = await Promise.all([part("OC-1041"), part("OC-1042")]);
	});

	test("records its rejected points as the defects, with the engineer's grade and photos, the unit's over all and each component's over its own", async () => {
		expect(points.springs).toHaveLength(2);
		// The engineer's defect of the rejected spring point, with a photo; and a draft of a point
		// they found OK in the end, whose photo goes.
		const [draft] = await rows<{ id: number }>(
			`insert into condition_point_defect
				(organization_id, checklist_point_id, equipment_id, severity, extent, intensity, updated_at)
			 values (?, 990002, ?, 'severe', 50, 'final', 0) returning id`,
			[shltrId, door.id],
		);
		const [stale] = await rows<{ id: number }>(
			`insert into condition_point_defect
				(organization_id, checklist_point_id, equipment_id, severity, extent, intensity, updated_at)
			 values (?, 990004, ?, 'slight', 1, 'initial', 0) returning id`,
			[shltrId, door.id],
		);
		await rows(
			`insert into condition_defect_photo
				(organization_id, equipment_id, point_defect_id, object_key, content_type, size, position)
			 values (?, ?, ?, 'x/conditions/a.jpg', 'image/jpeg', 10, 0),
				(?, ?, ?, 'x/conditions/b.jpg', 'image/jpeg', 10, 0)`,
			[shltrId, door.id, draft.id, shltrId, door.id, stale.id],
		);
		const since = Number(await value(`select max(id) from unit_condition`));
		await completed(door.id, door.order, levId, [
			{ id: 990001, templateItemId: points.springs[0], result: "ok" },
			{ id: 990002, templateItemId: points.springs[1], result: "nok", remark: "Veer gebroken" },
			{ id: 990003, templateItemId: points.cables, result: "na" },
			{ id: 990004, templateItemId: points.other, result: "ok" },
			// A point added to the checklist by hand, of no template, rejected without a grade.
			{ id: 990005, templateItemId: null, result: "nok", remark: "Paneel gedeukt" },
		]);
		const by = {
			organization_id: shltrId,
			legacy_percent: null,
			advice: null,
			source: "checklist",
			order_id: door.order,
			engineer_id: levId,
			user_id: await userOf(lev),
		};
		const recorded = (await conditionsOf(door.id, true)).filter((each) => each.id > since);
		// The unit: the spring's defect, on the springs (severe, final, 50%: 5) and the hand-made
		// point's, on the unit (serious, advanced, 20% without a grade: 2), the worst element 5; the
		// springs: their own; the cables none (N/A).
		expect(
			recorded
				.map(({ id: _id, ...each }) => each)
				.toSorted((a, b) => (a.component_id ?? 0) - (b.component_id ?? 0)),
		).toEqual([
			{ ...by, component_id: null, score: 5 },
			{ ...by, component_id: springs, score: 5 },
		]);
		const whole = recorded.find((each) => each.component_id === null)!;
		expect(await defectsOf(whole.id)).toEqual([
			{
				component_id: springs,
				description: `Punt 990002: Veer gebroken`,
				severity: "severe",
				extent: 50,
				intensity: "final",
				score: 5,
				checklist_point_id: 990002,
				photos: 1,
			},
			{
				component_id: null,
				description: "Punt 990005: Paneel gedeukt",
				severity: "serious",
				extent: 20,
				intensity: "advanced",
				score: 2,
				checklist_point_id: 990005,
				photos: 0,
			},
		]);
		const own = recorded.find((each) => each.component_id === springs)!;
		expect(
			(await defectsOf(own.id)).map((each) => [each.component_id, each.score, each.photos]),
		).toEqual([[springs, 5, 1]]);
		// The drafts are gone, and the photo of the one that became no defect.
		expect(
			await value(
				`select count(*) from condition_point_defect where checklist_point_id in (990002, 990004)`,
			),
		).toBe(0);
		expect(
			await rows(
				`select object_key from condition_defect_photo where object_key like 'x/%' order by id`,
			),
		).toEqual([{ object_key: "x/conditions/a.jpg" }, { object_key: "x/conditions/a.jpg" }]);
		expect(cables).toBeGreaterThan(0);
	});

	test("with counted points and none rejected records 1, for the unit and its components", async () => {
		const since = Number(await value(`select max(id) from unit_condition`));
		await completed(door.id, door.order, levId, [
			{ id: 990011, templateItemId: points.springs[0], result: "ok" },
			{ id: 990012, templateItemId: points.cables, result: "ok" },
			{ id: 990013, templateItemId: points.other, result: "na" },
		]);
		const recorded = (await conditionsOf(door.id, true)).filter((each) => each.id > since);
		expect(recorded.map((each) => [each.component_id, each.score]).toSorted(byElement)).toEqual(
			[
				[null, 1],
				[springs, 1],
				[cables, 1],
			].toSorted(byElement),
		);
	});

	test("whose points are all not applicable gives no score", async () => {
		const before = await conditionCount();
		await completed(door.id, door.order, levId, [
			{ id: 990021, templateItemId: points.springs[0], result: "na" },
			{ id: 990022, templateItemId: points.other, result: "na" },
		]);
		expect(await conditionCount()).toBe(before);
	});
});

describe("the engineer, in the portal", () => {
	/** A planned order of Lev's with a unit whose checklist is a draft, and its first point. */
	let job: { id: number; number: string; equipment_id: number; checklist: number; point: number };

	beforeAll(async () => {
		[job] = await rows<{
			id: number;
			number: string;
			equipment_id: number;
			checklist: number;
			point: number;
		}>(
			`select o.id, o.number, k.equipment_id, k.id as checklist,
				(select r.id from checklist_result r where r.checklist_id = k.id order by r.position limit 1) as point
			 from "order" o join checklist k on k.order_id = o.id
			 where o.engineer_id = ? and o.status = 'scheduled' and k.status = 'draft'
			 order by o.scheduled_for, k.id limit 1`,
			[levId],
		);
	});

	const unitOnJob = () => ({ number: job.number, equipmentId: job.equipment_id });
	const pointOnJob = () => ({ ...unitOnJob(), pointId: job.point });
	/** Lev's defect form for the job's point, its fields as the browser sends them. */
	const giveDefect = (fields: Record<string, unknown>, actor: Actor = lev) =>
		as(actor, () =>
			submit(saveFieldPointDefectForm, {
				number: job.number,
				equipmentId: String(job.equipment_id),
				pointId: String(job.point),
				severity: "serious",
				extent: "20",
				intensity: "advanced",
				...fields,
			}),
		);
	/** Lev's advice form, its fields as the browser sends them (ids as strings), with `fields`. */
	const advise = (fields: Record<string, unknown>) =>
		as(lev, () =>
			submit(adviseFieldConditionForm, {
				number: job.number,
				equipmentId: String(job.equipment_id),
				...fields,
			}),
		);

	test("isn't asked before the job's started, nor before its checklist gave a score", async () => {
		expect(job, "Lev has a planned job with a draft checklist").toBeDefined();
		const before = await as(lev, () => data(getFieldCondition, unitOnJob()));
		expect(before).toMatchObject({ recorded: null, components: [], canChange: false });
		expect(await as(lev, () => data(getFieldPointDefect, pointOnJob()))).toMatchObject({
			canChange: false,
			defect: null,
			photos: [],
		});
		expect(await giveDefect({})).toMatchObject({
			status: 400,
			message: "The checklist can't be changed any more.",
		});
		expect(await advise({ advice: "Te vroeg." })).toMatchObject({
			status: 400,
			message: `Order ${job.number} isn't in progress: conditions are recorded while the work is under way.`,
		});
		expect(await as(lev, () => submit(startWork, { id: String(job.id) }))).toMatchObject({
			status: 200,
		});
		expect(await advise({ advice: "Te vroeg." })).toMatchObject({
			status: 400,
			message: "The checklist gave no score: none of its points counted (all not applicable).",
		});
	});

	test("gives a rejected point its defect and photos, changes it and takes a photo off", async () => {
		expect(await giveDefect({ photos: [jpeg()] })).toMatchObject({ status: 200 });
		let shown = await as(lev, () => data(getFieldPointDefect, pointOnJob()));
		expect(shown).toMatchObject({
			canChange: true,
			defect: { severity: "serious", extent: 20, intensity: "advanced" },
			photos: [{ id: expect.any(Number) }],
		});
		expect((await photo(lev, String(shown.photos[0].id))).status).toBe(200);
		expect(
			await giveDefect({ severity: "severe", extent: "50", intensity: "final", photos: [jpeg()] }),
		).toMatchObject({ status: 200 });
		shown = await as(lev, () => data(getFieldPointDefect, pointOnJob()));
		expect(shown.defect).toEqual({ severity: "severe", extent: 50, intensity: "final" });
		expect(shown.photos).toHaveLength(2);
		const [first] = shown.photos;
		expect(
			await as(lev, () => call(removeFieldPointPhoto, { ...pointOnJob(), photoId: first.id })),
		).toMatchObject({ status: 200 });
		shown = await as(lev, () => data(getFieldPointDefect, pointOnJob()));
		expect(shown.photos.map((each) => each.id)).not.toContain(first.id);
		expect(
			await value(`select count(*) from condition_point_defect where checklist_point_id = ?`, [
				job.point,
			]),
		).toBe(1);
	});

	test("another engineer's or tenant's point, or a tampered one, is a 404 and keeps nothing", async () => {
		const [others] = await rows<{ number: string; equipment_id: number; point: number }>(
			`select o.number, k.equipment_id,
				(select r.id from checklist_result r where r.checklist_id = k.id limit 1) as point
			 from "order" o join checklist k on k.order_id = o.id
			 where o.organization_id = ? and (o.engineer_id is null or o.engineer_id <> ?) limit 1`,
			[shltrId, levId],
		);
		const before = await value(`select count(*) from condition_point_defect`);
		for (const fields of [
			{ pointId: String(others.point) },
			{
				number: others.number,
				equipmentId: String(others.equipment_id),
				pointId: String(others.point),
			},
			// Lev's own order and unit, another checklist's point.
			{ pointId: String(others.point) },
		]) {
			expect(await giveDefect(fields), JSON.stringify(fields)).toMatchObject({ status: 404 });
		}
		expect(
			await as(lev, () =>
				call(getFieldPointDefect, {
					number: others.number,
					equipmentId: others.equipment_id,
					pointId: others.point,
				}),
			),
		).toMatchObject({ status: 404 });
		expect(await giveDefect({}, north.engineer)).toMatchObject({ status: 404 });
		expect(await value(`select count(*) from condition_point_defect`)).toBe(before);
	});

	test("their completed checklist records the rejected point's defect, with its grade and photo", async () => {
		// Answered and completed as the checklists module does (its own tests drive its commands): the
		// point rejected with its remark, the rest OK, then its completion hook in a transaction.
		await rows(
			`update checklist_result set result = case when id = ? then 'nok' else 'ok' end,
				remark = case when id = ? then 'Veer gebroken' else remark end where checklist_id = ?`,
			[job.point, job.point, job.checklist],
		);
		const points = await rows<{
			id: number;
			template_item_id: number | null;
			text: string;
			result: "ok" | "nok";
			remark: string | null;
		}>(
			`select id, template_item_id, text, result, remark from checklist_result
			 where checklist_id = ? order by position`,
			[job.checklist],
		);
		await as(lev, () =>
			db.transaction((tx) =>
				recordChecklistConditions({
					tx,
					checklist: {
						id: job.checklist,
						kind: "inspection",
						orderId: job.id,
						equipmentId: job.equipment_id,
						engineerId: levId,
					},
					points: points.map(({ template_item_id, ...point }) => ({
						...point,
						templateItemId: template_item_id,
					})),
				}),
			),
		);
		const shown = await as(lev, () => data(getFieldCondition, unitOnJob()));
		expect(shown).toMatchObject({ recorded: { score: 5, advice: null }, canChange: true });
		expect(shown.recorded!.defects).toMatchObject([
			{
				description: expect.stringContaining("Veer gebroken"),
				severity: "severe",
				extent: 50,
				intensity: "final",
				score: 5,
				photos: [{ id: expect.any(Number) }],
			},
		]);
		expect(
			await value(`select count(*) from condition_point_defect where checklist_point_id = ?`, [
				job.point,
			]),
		).toBe(0);
	});

	test("their advice goes onto the condition the checklist gave the unit, logged, without a new one", async () => {
		const shown = await as(lev, () => data(getFieldCondition, unitOnJob()));
		const before = await conditionCount();
		const answered = await advise({ advice: "Kabelset vervangen (SD-002)." });
		expect(answered).toMatchObject({ status: 200 });
		expect(await conditionCount()).toBe(before);
		const [recorded] = await conditionsOf(job.equipment_id);
		expect(recorded).toMatchObject({
			id: shown.recorded!.id,
			score: 5,
			advice: "Kabelset vervangen (SD-002).",
			source: "checklist",
			order_id: job.id,
			engineer_id: levId,
		});
		const [entry] = await rows<{ action: string; changes: string }>(
			`select action, changes from activity where subject_type = 'unitCondition' and subject_id = ?
			 order by id desc limit 1`,
			[String(recorded.id)],
		);
		expect(entry.action).toBe("updated");
		expect(JSON.parse(entry.changes)).toEqual({
			advice: [null, "Kabelset vervangen (SD-002)."],
		});
	});

	test("a unit not on the order, or another tenant's order, is a 404", async () => {
		const [elsewhere] = await rows<{ id: number }>(
			`select e.id from equipment e where e.organization_id = ? and not exists
			 (select 1 from order_unit u where u.order_id = ? and u.equipment_id = e.id) limit 1`,
			[shltrId, job.id],
		);
		const [northern] = await rows<{ number: string; equipment_id: number }>(
			`select o.number, u.equipment_id from "order" o join order_unit u on u.order_id = o.id
			 where o.organization_id = ? limit 1`,
			[northId],
		);
		const before = await conditionCount();
		const advised = (await conditionsOf(job.equipment_id))[0].advice;
		for (const fields of [
			{ equipmentId: elsewhere.id },
			{ number: northern.number, equipmentId: northern.equipment_id },
		]) {
			const target = { ...unitOnJob(), ...fields };
			expect(
				await as(lev, () => call(getFieldCondition, target)),
				JSON.stringify(fields),
			).toMatchObject({ status: 404 });
			expect(
				await advise({
					...fields,
					equipmentId: String(target.equipmentId),
					advice: "Gemanipuleerd.",
				}),
				JSON.stringify(fields),
			).toMatchObject({ status: 404 });
		}
		expect(await conditionCount()).toBe(before);
		expect((await conditionsOf(job.equipment_id))[0].advice).toBe(advised);
	});

	test("another engineer's order, with its unit, is a 404 to read and to advise on", async () => {
		// The condition of the engineer's own scope in findFieldUnit(): SHLTR's own orders.
		const [others] = await rows<{ number: string; equipment_id: number }>(
			`select o.number, u.equipment_id from "order" o join order_unit u on u.order_id = o.id
			 where o.organization_id = ? and o.engineer_id <> ? and not exists
			 (select 1 from "order" s where s.engineer_id = ? and s.number = o.number) limit 1`,
			[shltrId, levId, levId],
		);
		const before = await conditionCount();
		const target = { number: others.number, equipmentId: others.equipment_id };
		expect(await as(lev, () => call(getFieldCondition, target))).toMatchObject({
			status: 404,
			message: `Order ${others.number} not found`,
		});
		expect(
			await advise({
				...target,
				equipmentId: String(target.equipmentId),
				advice: "Gemanipuleerd.",
			}),
		).toMatchObject({ status: 404 });
		expect(await conditionCount()).toBe(before);
	});

	test("is an engineer's: an office member is refused it", async () => {
		expect(await as(shltr.member, () => call(getFieldCondition, unitOnJob()))).toMatchObject({
			status: 403,
		});
		expect(await as(shltr.member, () => call(getFieldPointDefect, pointOnJob()))).toMatchObject({
			status: 403,
		});
		expect(await giveDefect({}, shltr.member)).toMatchObject({ status: 403 });
		expect(
			await as(shltr.member, () =>
				submit(adviseFieldConditionForm, {
					number: job.number,
					equipmentId: String(job.equipment_id),
					advice: "Overgenomen.",
				}),
			),
		).toMatchObject({ status: 403 });
	});
});
