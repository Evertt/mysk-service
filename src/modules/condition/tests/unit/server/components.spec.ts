/**
 * A unit's components on the seeded demo database, as its card on the unit's page uses them, in
 * SHLTR's office: listed in their order with their articles, points, latest conditions and
 * statuses (the unit's taking its worst in); added (numbered next, last, with its article's shop
 * points unless told otherwise), changed, given a condition as a correction, moved and removed,
 * each logged against the unit; the article a rejected point that checks one suggests; the customer
 * portal's home; and North never reading or changing another tenant's units or components, nor
 * giving its own another tenant's article or points. The server side of
 * `condition.components.test.ts` and `condition.tenancy.test.ts`, which keep the cards and dialogs.
 */
import { describe, expect, test } from "vite-plus/test";

import { getClientAttention } from "#modules/condition/client/client-condition.remote.ts";
import {
	findArticles,
	getUnitComponents,
	moveComponent,
	removeComponent,
	saveComponent,
} from "#modules/condition/components.remote.ts";
import { getUnitCondition, recordCondition } from "#modules/condition/condition.remote.ts";
import { componentArticles } from "#modules/condition/server/components.ts";
import {
	as,
	call,
	data,
	demoAccount,
	north,
	organizationId,
	rows,
	shltr,
	submit,
	value,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

import { unitStates } from "./support.ts";

const [northId, shltrId] = [organizationId("north"), organizationId("shltr")];

/** SHLTR's unit by name, of Riedel B.V. */
const unitNamed = async (name: string) =>
	(
		await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e join customer c on c.id = e.customer_id
			 where e.organization_id = ? and e.name = ? and c.name = 'Riedel B.V.'
			 and e.status <> 'decommissioned' order by e.id limit 1`,
			[shltrId, name],
		)
	)[0];

/** A unit's components as stored, in their order. */
const componentsOf = (equipmentId: number) =>
	rows<{
		id: number;
		organization_id: string;
		number: string;
		name: string;
		material_id: number | null;
		position: number;
	}>(
		`select id, organization_id, number, name, material_id, position from component
		 where equipment_id = ? order by position, id`,
		[equipmentId],
	);

/** The template points that check a component, by id. */
const checkpointsOf = async (componentId: number) =>
	(
		await rows<{ template_item_id: number }>(
			`select template_item_id from component_checkpoint where component_id = ?
			 order by template_item_id`,
			[componentId],
		)
	).map((row) => row.template_item_id);

/** A tenant's material by SKU. */
const materialOf = (sku: string, organization = shltrId) =>
	value<number>(`select id from material where organization_id = ? and sku = ?`, [
		organization,
		sku,
	]);

/** SHLTR's template point by its text. */
const pointOf = (text: string) =>
	value<number>(`select id from checklist_template_item where organization_id = ? and text = ?`, [
		shltrId,
		text,
	]);

/** What was logged about a component, oldest first. */
const loggedOf = (componentId: number) =>
	rows<{ action: string; subject_label: string; parent_id: string; changes: string | null }>(
		`select action, subject_label, parent_id, changes from activity
		 where subject_type = 'component' and subject_id = ? order by id`,
		[String(componentId)],
	);

const jan = shltr.member;

describe("a unit's components, in SHLTR's office", () => {
	test("are listed in their order, with their articles, points, conditions and statuses", async () => {
		const door = await unitNamed("Sectionaaldeur laaddok 07");
		const card = await as(jan, () => data(getUnitComponents, door.serial_number));
		expect(card.components.map((part) => part.number)).toEqual(["OC-1041", "OC-1042"]);
		expect(card.components[0]).toMatchObject({
			name: "Torsieveerpakket",
			article: { sku: "SD-001" },
			score: 22,
			status: "critical",
		});
		expect(card.components[0].checkpointIds).toHaveLength(2);
		expect(card.has).toEqual({ materials: true, checklists: true });
		// The unit's status takes its worst component's in, as the rules have it.
		const state = (await unitStates(shltrId)).find((unit) => unit.id === door.id)!;
		expect(state.status).toBe("critical");
		const unit = await as(jan, () => data(getUnitCondition, door.serial_number));
		expect(unit.status).toBe(state.status);
		expect(unit.concern).toBe(state.concern);
	});

	let unit: { id: number; serial_number: string };
	let made: { id: number; number: string };

	test("one is added with an article, whose shop points check it unless told otherwise, logged", async () => {
		unit = await unitNamed("Sectionaaldeur D-09");
		const before = await componentsOf(unit.id);
		const article = await materialOf("SD-002");
		const answer = await as(jan, () =>
			submit(saveComponent, {
				serialNumber: unit.serial_number,
				id: "",
				name: "Kabelset",
				materialId: String(article),
				checkpointIds: [],
			}),
		);
		expect(answer).toMatchObject({
			status: 200,
		});
		const after = await componentsOf(unit.id);
		const added = after.at(-1)!;
		expect(after).toHaveLength(before.length + 1);
		expect(added).toMatchObject({
			organization_id: shltrId,
			name: "Kabelset",
			material_id: article,
			position: Math.max(...before.map((part) => part.position)) + 1,
			// Numbered after the mockup's codes.
			number: "OC-4005",
		});
		made = { id: added.id, number: added.number };
		// The shop's points of SD-002.
		const shop = await Promise.all(
			[
				"Staaldraadkabels vrij van rafels en corrosie",
				"Veerbreukbeveiliging en kabelbreukbeveiliging getest",
			].map(pointOf),
		);
		expect(await checkpointsOf(added.id)).toEqual(shop.toSorted((a, b) => a - b));
		expect(await loggedOf(added.id)).toEqual([
			{
				action: "created",
				subject_label: `${unit.serial_number} · OC-4005 · Kabelset`,
				parent_id: String(unit.id),
				changes: null,
			},
		]);

		// Told otherwise: only the points it's given.
		const cables = await pointOf("Staaldraadkabels vrij van rafels en corrosie");
		await as(jan, () =>
			submit(saveComponent, {
				serialNumber: unit.serial_number,
				id: "",
				name: "Kabelset rechts",
				materialId: String(article),
				checkpointIds: [String(cables)],
			}),
		);
		const second = (await componentsOf(unit.id)).at(-1)!;
		expect(second).toMatchObject({ name: "Kabelset rechts", number: "OC-4006" });
		expect(await checkpointsOf(second.id)).toEqual([cables]);
	});

	test("its name and points are changed, logged with what changed", async () => {
		const cables = await pointOf("Staaldraadkabels vrij van rafels en corrosie");
		const article = await materialOf("SD-002");
		const answer = await as(jan, () =>
			submit(saveComponent, {
				serialNumber: unit.serial_number,
				id: String(made.id),
				name: "Staaldraadkabels links",
				materialId: String(article),
				checkpointIds: [String(cables)],
			}),
		);
		expect(answer.status).toBe(200);
		expect((await componentsOf(unit.id)).find((part) => part.id === made.id)?.name).toBe(
			"Staaldraadkabels links",
		);
		expect(await checkpointsOf(made.id)).toEqual([cables]);
		const [, updated] = await loggedOf(made.id);
		expect(updated.action).toBe("updated");
		expect(JSON.parse(updated.changes!)).toEqual({
			name: ["Kabelset", "Staaldraadkabels links"],
			checkpoints: [2, 1],
		});
	});

	test("while checklists is off, its points are read and kept as they are", async () => {
		const cables = await pointOf("Staaldraadkabels vrij van rafels en corrosie");
		const article = await materialOf("SD-002");
		await withoutModule("shltr", "checklists", async () => {
			const card = await as(jan, () => data(getUnitComponents, unit.serial_number));
			expect(card.has.checklists).toBe(false);
			expect(card.checkpoints).toEqual([]);
			expect(card.components.find((part) => part.id === made.id)?.checkpointIds).toEqual([cables]);
			// The dialog offers no points, so it sends none: the rename keeps them.
			const answer = await as(jan, () =>
				submit(saveComponent, {
					serialNumber: unit.serial_number,
					id: String(made.id),
					name: "Staaldraadkabels",
					materialId: String(article),
					checkpointIds: [],
				}),
			);
			expect(answer.status).toBe(200);
		});
		expect((await componentsOf(unit.id)).find((part) => part.id === made.id)?.name).toBe(
			"Staaldraadkabels",
		);
		expect(await checkpointsOf(made.id)).toEqual([cables]);
		expect(JSON.parse((await loggedOf(made.id)).at(-1)!.changes!)).toEqual({
			name: ["Staaldraadkabels links", "Staaldraadkabels"],
		});
	});

	test("its condition is recorded as a correction, and its status and its unit's follow", async () => {
		const answer = await as(jan, () =>
			submit(recordCondition, {
				serialNumber: unit.serial_number,
				componentId: String(made.id),
				score: 35,
				advice: "Kabelset vervangen (SD-002).",
			}),
		);
		expect(answer).toMatchObject({
			status: 200,
		});
		const janId = await value<string>(`select id from user where email = ?`, [jan.email]);
		expect(
			await rows(
				`select score, advice, source, order_id, engineer_id, user_id from unit_condition
				 where component_id = ?`,
				[made.id],
			),
		).toEqual([
			{
				score: 35,
				advice: "Kabelset vervangen (SD-002).",
				source: "office",
				order_id: null,
				engineer_id: null,
				user_id: janId,
			},
		]);
		const state = (await unitStates(shltrId)).find((each) => each.id === unit.id)!;
		const part = state.components.find((each) => each.id === made.id)!;
		expect(part.concern).toBe("critical");
		expect(state.concern).toBe("critical");
		const card = await as(jan, () => data(getUnitComponents, unit.serial_number));
		expect(card.components.find((each) => each.id === made.id)).toMatchObject({
			score: 35,
			status: part.status,
			concern: "critical",
		});
		const condition = await as(jan, () => data(getUnitCondition, unit.serial_number));
		expect(condition).toMatchObject({ status: state.status, concern: "critical" });
	});

	test("it's moved up among its unit's components, logged", async () => {
		const before = (await componentsOf(unit.id)).map((part) => part.number);
		const at = before.indexOf(made.number);
		expect(at).toBeGreaterThan(0);
		const answer = await as(jan, () =>
			submit(moveComponent, { id: String(made.id), direction: "up" }),
		);
		expect(answer).toMatchObject({ status: 200 });
		const expected = [...before];
		[expected[at - 1], expected[at]] = [expected[at], expected[at - 1]];
		expect((await componentsOf(unit.id)).map((part) => part.number)).toEqual(expected);
		expect(JSON.parse((await loggedOf(made.id)).at(-1)!.changes!)).toEqual({
			position: [at + 1, at],
		});
	});

	test("it's removed with its conditions and points, logged", async () => {
		const answer = await as(jan, () => submit(removeComponent, { id: String(made.id) }));
		expect(answer.status).toBe(200);
		expect((await componentsOf(unit.id)).map((part) => part.id)).not.toContain(made.id);
		expect(await rows(`select id from unit_condition where component_id = ?`, [made.id])).toEqual(
			[],
		);
		expect(await checkpointsOf(made.id)).toEqual([]);
		expect((await loggedOf(made.id)).at(-1)).toMatchObject({
			action: "deleted",
			parent_id: String(unit.id),
		});
	});

	test("a rejected point that checks a component suggests its article", async () => {
		const door = await unitNamed("Sectionaaldeur laaddok 07");
		const [checked] = await rows<{ template_item_id: number }>(
			`select cc.template_item_id from component_checkpoint cc join component k on k.id = cc.component_id
			 where k.number = 'OC-1041' and k.organization_id = ?`,
			[shltrId],
		);
		const unchecked = await value<number>(
			`select id from checklist_template_item where organization_id = ? and id not in
			 (select template_item_id from component_checkpoint) order by id limit 1`,
			[shltrId],
		);
		const points = [
			{ equipmentId: door.id, templateItemId: checked.template_item_id },
			{ equipmentId: door.id, templateItemId: unchecked },
		];
		expect(await as(jan, () => componentArticles({ points }))).toEqual([
			{ ...points[0], materialId: await materialOf("SD-001") },
		]);
	});

	test("the customer portal's home shows the unit with its components' conditions and advice", async () => {
		const door = await unitNamed("Sectionaaldeur laaddok 07");
		const { units } = await as(demoAccount("facilitair@riedel.example"), () =>
			data(getClientAttention),
		);
		const shown = units.find((each) => each.serialNumber === door.serial_number)!;
		expect(shown.components.map((part) => part.number)).toEqual(["OC-1041", "OC-1042"]);
		expect(shown.components[0]).toMatchObject({
			name: "Torsieveerpakket",
			score: 22,
			advice: "Veerpakket vervangen (SD-001) — cyclusteller boven 90%.",
		});
	});
});

describe("the articles a component can be linked to", () => {
	test("are found by SKU or name, the first so many, with the points their shop products fix", async () => {
		const found = await as(jan, () => data(findArticles, "sd-002"));
		const shop = await rows<{ id: number }>(
			`select k.template_item_id as id from shop_product_checkpoint k
			 join shop_product p on p.id = k.product_id where p.material_id = ? order by k.template_item_id`,
			[await materialOf("SD-002")],
		);
		expect(shop.length).toBeGreaterThan(0);
		expect(found.more).toBe(false);
		expect(found.articles).toHaveLength(1);
		expect(found.articles[0]).toMatchObject({ sku: "SD-002", name: "Kabelset compleet" });
		expect(found.articles[0].checkpointIds.toSorted((a, b) => a - b)).toEqual(
			shop.map((row) => row.id),
		);

		// An empty search: the first 20 by SKU, and whether there are more.
		const materials = await rows<{ sku: string }>(
			`select sku from material where organization_id = ? order by sku`,
			[shltrId],
		);
		const all = await as(jan, () => data(findArticles, ""));
		expect(all.articles.map((article) => article.sku)).toEqual(
			materials.slice(0, 20).map((row) => row.sku),
		);
		expect(all.more).toBe(materials.length > 20);
	});

	test("are the tenant's own, and none while it hasn't materials", async () => {
		const own = new Set(
			(
				await rows<{ id: number }>(`select id from material where organization_id = ?`, [northId])
			).map((row) => row.id),
		);
		const theirs = await as(north.member, () => data(findArticles, ""));
		for (const article of theirs.articles) expect(own.has(article.id), article.sku).toBe(true);
		await withoutModule("shltr", "materials", async () => {
			expect(await as(jan, () => data(findArticles, "SD-002"))).toEqual({
				articles: [],
				more: false,
			});
		});
	});
});

describe("another tenant's units and components, to North", () => {
	test("are a 404 to read or change, also by their ids, and stay as they were", async () => {
		const [theirs] = await rows<{ id: number; equipment_id: number; serial_number: string }>(
			`select c.id, c.equipment_id, e.serial_number from component c
			 join equipment e on e.id = c.equipment_id where c.organization_id = ? order by c.id limit 1`,
			[shltrId],
		);
		const own = await value<string>(
			`select serial_number from equipment where organization_id = ?
			 and serial_number not in (select serial_number from equipment where organization_id = ?)
			 order by id limit 1`,
			[northId, shltrId],
		);
		const state = async () => ({
			components: await componentsOf(theirs.equipment_id),
			checkpoints: await checkpointsOf(theirs.id),
			conditions: await rows(`select * from unit_condition where equipment_id = ? order by id`, [
				theirs.equipment_id,
			]),
		});
		const before = await state();
		const id = String(theirs.id);
		await as(north.member, async () => {
			const answers = {
				getUnitComponents: await call(getUnitComponents, theirs.serial_number),
				getUnitCondition: await call(getUnitCondition, theirs.serial_number),
				"adding to their unit": await submit(saveComponent, {
					serialNumber: theirs.serial_number,
					id: "",
					name: "Gekaapt",
				}),
				"changing theirs": await submit(saveComponent, { serialNumber: own, id, name: "Gekaapt" }),
				"recording their unit's": await submit(recordCondition, {
					serialNumber: theirs.serial_number,
					score: 10,
				}),
				"recording theirs on North's unit": await submit(recordCondition, {
					serialNumber: own,
					componentId: id,
					score: 5,
				}),
				moveComponent: await submit(moveComponent, { id, direction: "up" }),
				removeComponent: await submit(removeComponent, { id }),
			};
			for (const [name, answer] of Object.entries(answers)) {
				expect(answer.status, `${name}: ${JSON.stringify(answer)}`).toBe(404);
			}
		});
		expect(await state()).toEqual(before);
	});

	test("its own component takes neither another tenant's article nor its checklist points", async () => {
		// A unit of North's whose category has a template, to give a component.
		const own = await value<string>(
			`select e.serial_number from equipment e
			 join checklist_template_category t on t.category_id = e.category_id
			 where e.organization_id = ? and e.status <> 'decommissioned' order by e.id limit 1`,
			[northId],
		);
		const added = await as(north.member, () =>
			submit(saveComponent, { serialNumber: own, id: "", name: "Veerset" }),
		);
		expect(added.status).toBe(200);
		const [made] = await rows<{ id: number; number: string }>(
			`select id, number from component where organization_id = ? order by id desc limit 1`,
			[northId],
		);
		expect(made.number).toBe("OC-0001");
		const article = await value<number>(
			`select id from material where organization_id = ? order by id limit 1`,
			[shltrId],
		);
		const point = await value<number>(
			`select id from checklist_template_item where organization_id = ? order by id limit 1`,
			[shltrId],
		);
		const before = await rows(`select * from component where id = ?`, [made.id]);
		await as(north.member, async () => {
			expect(
				await submit(saveComponent, {
					serialNumber: own,
					id: String(made.id),
					name: "Veerset",
					materialId: String(article),
				}),
			).toMatchObject({
				status: 400,
				issues: [{ message: "That article isn't one of your materials." }],
			});
			expect(
				await submit(saveComponent, {
					serialNumber: own,
					id: String(made.id),
					name: "Veerset",
					checkpointIds: [String(point)],
				}),
			).toMatchObject({
				status: 400,
				issues: [{ message: "Those checklist points aren't the unit's." }],
			});
		});
		expect(await rows(`select * from component where id = ?`, [made.id])).toEqual(before);
		expect(await checkpointsOf(made.id)).toEqual([]);
	});
});
