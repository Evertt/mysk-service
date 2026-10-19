/**
 * Recording a unit's condition on the seeded demo database: by a member in the office (stored,
 * logged against the unit, its status following, a newer one taking its place); by a completed
 * checklist (`checklists.completed`: the unit's score from its points, not-applicable ones left
 * out, each component's over its own points, none when nothing counts); and the engineer's advice
 * on the condition his checklist gave the unit, while the order's in progress. Another tenant's
 * unit, a unit not on the order and another engineer's order are a 404, also by tampered fields.
 * The server side of `condition.office.test.ts`, `condition.portal.test.ts` and
 * `condition.tenancy.test.ts`, which keep the cards and one tampered form.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { db } from "#lib/server/db/index.ts";
import { getUnitCondition, recordCondition } from "#modules/condition/condition.remote.ts";
import {
	adviseFieldConditionForm,
	getFieldCondition,
} from "#modules/condition/portal/field-condition.remote.ts";
import { recordChecklistConditions } from "#modules/condition/server/conditions.ts";
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
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId, shltrId] = [
	organizationId("north"),
	organizationId("south"),
	organizationId("shltr"),
];
const lev = shltr.engineer;

/** The type of a condition as stored. */
interface StoredCondition {
	id: number;
	organization_id: string;
	component_id: number | null;
	score: number;
	advice: string | null;
	source: string;
	order_id: number | null;
	engineer_id: number | null;
	user_id: string | null;
}

/** A unit's conditions as stored (as a whole, or also its components'), newest first. */
const conditionsOf = (equipmentId: number, components = false) =>
	rows<StoredCondition>(
		`select id, organization_id, component_id, score, advice, source, order_id, engineer_id, user_id
		 from unit_condition where equipment_id = ? ${components ? "" : "and component_id is null"}
		 order by recorded_at desc, id desc`,
		[equipmentId],
	);

const conditionCount = async () => Number(await value(`select count(*) from unit_condition`));

const userOf = (actor: Actor) =>
	value<string>(`select id from user where email = ?`, [actor.email]);

/**
 * Completes, as far as the condition module is concerned, a checklist of `equipmentId` on
 * `orderId` with `points`: its hook in a transaction of Lev's request, as completing one runs it.
 */
const completed = (
	equipmentId: number,
	orderId: number,
	engineerId: number,
	points: { templateItemId: number | null; result: "ok" | "nok" | "na" }[],
) =>
	as(lev, () =>
		db.transaction((tx) =>
			recordChecklistConditions({
				tx,
				checklist: { id: 0, kind: "inspection", orderId, equipmentId, engineerId },
				points,
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
	test("is stored and logged against the unit, its status following; a newer one takes its place", async () => {
		const [unit] = await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e where e.organization_id = ?
			 and e.status = 'operational'
			 and not exists (select 1 from checklist k where k.equipment_id = e.id)
			 and not exists (select 1 from unit_condition u where u.equipment_id = e.id)
			 and not exists (select 1 from order_unit ou join "order" o on o.id = ou.order_id
				where ou.equipment_id = e.id and o.status in ('scheduled', 'in_progress'))
			 order by e.id limit 1`,
			[northId],
		);
		expect(unit, "North has a unit without a condition").toBeDefined();
		const serialNumber = unit.serial_number;
		expect((await as(north.owner, () => data(getUnitCondition, serialNumber))).history).toEqual([]);

		const answer = await as(north.owner, () =>
			submit(recordCondition, {
				serialNumber,
				componentId: "",
				score: 30,
				advice: "Veerpakket vervangen (SD-001).",
			}),
		);
		expect(answer).toMatchObject({ status: 200, refreshed: ["getUnitCondition"] });
		const [recorded] = await conditionsOf(unit.id);
		expect(recorded).toEqual({
			id: expect.any(Number),
			organization_id: northId,
			component_id: null,
			score: 30,
			advice: "Veerpakket vervangen (SD-001).",
			source: "office",
			order_id: null,
			engineer_id: null,
			user_id: await userOf(north.owner),
		});
		expect(
			await rows(
				`select action, subject_label, parent_id, note from activity
				 where subject_type = 'unitCondition' and subject_id = ?`,
				[String(recorded.id)],
			),
		).toEqual([
			{
				action: "recorded",
				subject_label: `${serialNumber} · 30%`,
				parent_id: String(unit.id),
				note: "Veerpakket vervangen (SD-001).",
			},
		]);
		const critical = await as(north.owner, () => data(getUnitCondition, serialNumber));
		expect(critical).toMatchObject({ status: "critical", concern: "critical" });
		expect(critical.history).toMatchObject([{ score: 30, source: "office", order: null }]);

		await as(north.owner, () => submit(recordCondition, { serialNumber, score: 85 }));
		const fine = await as(north.owner, () => data(getUnitCondition, serialNumber));
		expect(fine.status).toBe("ok");
		expect(fine.history.map((condition) => condition.score)).toEqual([85, 30]);
	});

	test("for another tenant's unit, or a component not the unit's, is a 404 and records nothing", async () => {
		const southern = await value<string>(
			`select serial_number from equipment where organization_id = ?
			 and serial_number not in (select serial_number from equipment where organization_id = ?)
			 order by id limit 1`,
			[southId, northId],
		);
		const own = await value<string>(
			`select serial_number from equipment where organization_id = ? order by id limit 1`,
			[northId],
		);
		const theirs = await value<number>(
			`select id from component where organization_id = ? order by id limit 1`,
			[shltrId],
		);
		const before = await conditionCount();
		await as(north.owner, async () => {
			expect(await call(getUnitCondition, southern)).toMatchObject({ status: 404 });
			expect(await submit(recordCondition, { serialNumber: southern, score: 10 })).toMatchObject({
				status: 404,
			});
			expect(
				await submit(recordCondition, {
					serialNumber: own,
					componentId: String(theirs),
					score: 10,
				}),
			).toMatchObject({ status: 404 });
		});
		expect(await conditionCount()).toBe(before);
	});
});

describe("a completed checklist", () => {
	/** Sectionaaldeur laaddok 07 (OC-1041, two points; OC-1042, one), with an order of its. */
	let door: { id: number; order: number };
	let points: { springs: number[]; cables: number; other: number };

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
		const springs = await checks("OC-1041");
		const [cables] = await checks("OC-1042");
		const other = await value<number>(
			`select i.id from checklist_template_item i join checklist_template t on t.id = i.template_id
			 where t.organization_id = ? and t.name = 'Sectionaaldeur'
			 and i.id not in (select template_item_id from component_checkpoint) order by i.position limit 1`,
			[shltrId],
		);
		points = { springs, cables, other };
	});

	test("scores the unit from its points, N/A left out, and each component over its own", async () => {
		expect(points.springs).toHaveLength(2);
		const since = Number(await value(`select max(id) from unit_condition`));
		await completed(door.id, door.order, levId, [
			{ templateItemId: points.springs[0], result: "ok" },
			{ templateItemId: points.springs[1], result: "nok" },
			{ templateItemId: points.cables, result: "na" },
			{ templateItemId: points.other, result: "ok" },
			// A point added to the checklist by hand, of no template.
			{ templateItemId: null, result: "ok" },
		]);
		const by = {
			organization_id: shltrId,
			advice: null,
			source: "checklist",
			order_id: door.order,
			engineer_id: levId,
			user_id: await userOf(lev),
		};
		const springs = await value<number>(
			`select id from component where organization_id = ? and number = 'OC-1041'`,
			[shltrId],
		);
		const recorded = (await conditionsOf(door.id, true)).filter((each) => each.id > since);
		// Three OK of the four that count; the spring set one of its two; the cables none (N/A).
		expect(
			recorded.map(({ id: _id, ...each }) => each).toSorted((a, b) => a.score - b.score),
		).toEqual([
			{ ...by, component_id: springs, score: 50 },
			{ ...by, component_id: null, score: 75 },
		]);
	});

	test("whose points are all not applicable gives no score", async () => {
		const before = await conditionCount();
		await completed(door.id, door.order, levId, [
			{ templateItemId: points.springs[0], result: "na" },
			{ templateItemId: points.other, result: "na" },
		]);
		expect(await conditionCount()).toBe(before);
	});
});

describe("the engineer's advice, in the portal", () => {
	/** A planned order of Lev's, and a unit on it. */
	let job: { id: number; number: string; equipment_id: number };

	beforeAll(async () => {
		[job] = await rows<{ id: number; number: string; equipment_id: number }>(
			`select o.id, o.number, ou.equipment_id from "order" o join order_unit ou on ou.order_id = o.id
			 where o.engineer_id = ? and o.status = 'scheduled' order by o.scheduled_for, ou.position limit 1`,
			[levId],
		);
	});

	const unitOnJob = () => ({ number: job.number, equipmentId: job.equipment_id });
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
		const before = await as(lev, () => data(getFieldCondition, unitOnJob()));
		expect(before).toMatchObject({ recorded: null, components: [], canChange: false });
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

	test("goes onto the condition the checklist gave the unit, logged, without a new one", async () => {
		await completed(job.equipment_id, job.id, levId, [
			{ templateItemId: null, result: "ok" },
			{ templateItemId: null, result: "nok" },
		]);
		const shown = await as(lev, () => data(getFieldCondition, unitOnJob()));
		expect(shown).toMatchObject({ recorded: { score: 50, advice: null }, canChange: true });
		const before = await conditionCount();

		const answer = await advise({ advice: "Kabelset vervangen (SD-002)." });
		expect(answer).toMatchObject({ status: 200, refreshed: ["getFieldCondition"] });
		expect(await conditionCount()).toBe(before);
		const [recorded] = await conditionsOf(job.equipment_id);
		expect(recorded).toMatchObject({
			id: shown.recorded!.id,
			score: 50,
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
		expect((await as(lev, () => data(getFieldCondition, unitOnJob()))).recorded?.advice).toBe(
			"Kabelset vervangen (SD-002).",
		);
	});

	test("for a unit not on the order, or another tenant's order, is a 404", async () => {
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

	test("an order that isn't theirs is the portal's 404, naming the order", async () => {
		// North's, by a number none of Lev's orders has (numbers repeat across tenants).
		const [northern] = await rows<{ number: string; equipment_id: number }>(
			`select o.number, u.equipment_id from "order" o join order_unit u on u.order_id = o.id
			 where o.organization_id = ? and not exists
			 (select 1 from "order" s where s.engineer_id = ? and s.number = o.number) limit 1`,
			[northId, levId],
		);
		const target = { number: northern.number, equipmentId: northern.equipment_id };
		expect(await as(lev, () => call(getFieldCondition, target))).toMatchObject({
			status: 404,
			message: `Order ${northern.number} not found`,
		});
	});

	test("is an engineer's: an office member is refused it", async () => {
		expect(await as(shltr.member, () => call(getFieldCondition, unitOnJob()))).toMatchObject({
			status: 403,
		});
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
