/**
 * A material's remote functions on the seeded demo database: its page (the orders that use it and
 * its stock history), creating, editing and deleting it (a unique name in any case, the next SKU,
 * the opening balance, the unit kept while orders count in it or the history has part pieces),
 * receiving and counting stock (whole pieces only, a count that changes nothing refused), what's
 * logged, and South never seeing or changing North's materials, also by their ids. The server side
 * of `materials.test.ts`, which keeps the pages, the dialogs and one tampered form.
 */
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { countStock, receiveStock } from "#modules/materials/detail/stock.remote.ts";
import { bulkDeleteMaterials } from "#modules/materials/list/material-list.remote.ts";
import {
	createMaterial,
	deleteMaterial,
	getMaterial,
	updateMaterial,
} from "#modules/materials/material.remote.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	south,
	submit,
	value,
} from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];

interface Material {
	id: number;
	organization_id: string;
	sku: string;
	name: string;
	unit: string;
	unit_price: number;
	stock: number;
}

/** A material as stored, by SKU in an organization. */
const material = async (sku: string, organization = northId) =>
	(
		await rows<Material>(`select * from material where sku = ? and organization_id = ?`, [
			sku,
			organization,
		])
	)[0];

/** A material as stored, by id, to check that a refused request changed nothing. */
const snapshot = (id: number) => rows(`select * from material where id = ?`, [id]);

/** A material's stock movements as stored, newest first. */
const movements = (materialId: number) =>
	rows<{ kind: string; quantity: number; note: string | null; user: string | null }>(
		`select s.kind, s.quantity, s.note, u.email as user from stock_movement s
		 left join user u on u.id = s.user_id where s.material_id = ? order by s.created_at desc, s.id desc`,
		[materialId],
	);

/** A material's log, oldest first. */
const logOf = (id: number) =>
	rows<{ action: string; user: string | null; changes: string | null; note: string | null }>(
		`select a.action, u.email as user, a.changes, a.note from activity a
		 left join user u on u.id = a.user_id where a.subject_type = 'material' and a.subject_id = ?
		 order by a.id`,
		[String(id)],
	);

/** How many different orders use a material. */
const ordersUsing = async (id: number) =>
	Number(
		await value(`select count(distinct order_id) from order_line where material_id = ?`, [id]),
	);

/** The next SKU of an organization. */
const nextSku = async (organization: string) =>
	`MAT-${String(
		Number(
			await value(
				`select max(cast(substr(sku, 5) as integer)) from material where organization_id = ?`,
				[organization],
			),
		) + 1,
	).padStart(4, "0")}`;

/** North's material used on the most orders. */
const busiest = async () =>
	(
		await rows<Material>(
			`select m.* from material m where m.organization_id = ?
			 order by (select count(distinct order_id) from order_line where material_id = m.id) desc,
			 m.id limit 1`,
			[northId],
		)
	)[0];

/** The new material's form, as the browser sends it. */
const newMaterial = (fields: Record<string, unknown> = {}) => ({
	name: "Test gasket (materials spec)",
	unit: "pcs",
	unitPrice: 12.5,
	stock: 4,
	...fields,
});

/** The edit form of a stored material, as the page fills it, with `changes`. */
const editOf = (stored: Material, changes: Record<string, unknown> = {}) => ({
	id: String(stored.id),
	name: stored.name,
	unit: stored.unit,
	unitPrice: stored.unit_price / 100,
	...changes,
});

describe("a material's page", () => {
	test("lists the orders that use it, most recent first, and its movements with the stock after each", async () => {
		const busy = await busiest();
		const page = await as(north.member, () => data(getMaterial, busy.sku));
		expect(page.material).toMatchObject({ id: busy.id, name: busy.name, stock: busy.stock });
		expect(page.usage).toHaveLength(await ordersUsing(busy.id));
		const created = page.usage.map((row) => row.createdAt.epochMilliseconds);
		expect(created).toEqual(created.toSorted((a, b) => b - a));

		const stored = await movements(busy.id);
		expect(page.movements.map((row) => row.kind)).toEqual(stored.map((row) => row.kind));
		// The newest ends at the current stock; the oldest is the opening balance.
		expect(page.movements[0].balance).toBeCloseTo(busy.stock, 2);
		expect(page.movements.at(-1)?.kind).toBe("opening_balance");
		const consumed = page.movements.filter((row) => row.kind === "consumption");
		expect(consumed.length).toBeGreaterThan(0);
		for (const row of consumed) expect(row.orderNumber).toMatch(/^ORD-/);
	});

	test("of an unknown SKU is a 404", async () => {
		expect(await as(north.member, () => call(getMaterial, "MAT-9999"))).toMatchObject({
			status: 404,
		});
	});
});

describe("creating and editing a material", () => {
	test("a name that's taken, in any case, is refused", async () => {
		const busy = await busiest();
		const before = await value(`select count(*) from material where organization_id = ?`, [
			northId,
		]);
		const answer = await as(north.owner, () =>
			submit(createMaterial, newMaterial({ name: busy.name.toUpperCase() })),
		);
		expect(answer.status).toBe(400);
		expect(answer.issues).toEqual([
			{ name: "name", path: ["name"], message: `${busy.sku} already has this name` },
		]);
		expect(await value(`select count(*) from material where organization_id = ?`, [northId])).toBe(
			before,
		);
	});

	test("a new one gets the next SKU, and its stock as its opening balance by whoever made it; logged", async () => {
		const sku = await nextSku(northId);
		const answer = await as(north.owner, () => submit(createMaterial, newMaterial()));
		expect(answer).toMatchObject({ status: 303, location: `/materials/${sku}` });
		const created = await material(sku);
		expect(created).toMatchObject({
			name: "Test gasket (materials spec)",
			unit: "pcs",
			unit_price: 1250,
			stock: 4,
		});
		expect(await movements(created.id)).toEqual([
			{ kind: "opening_balance", quantity: 4, note: null, user: north.owner.email },
		]);
		expect(await logOf(created.id)).toMatchObject([{ action: "created", user: north.owner.email }]);
	});

	test("pieces start whole", async () => {
		const answer = await as(north.owner, () =>
			submit(createMaterial, newMaterial({ name: "Half a gasket", stock: 1.5 })),
		);
		expect(answer.issues).toEqual([
			{ name: "stock", path: ["stock"], message: "Whole pieces only" },
		]);
	});

	test("editing saves the name, the price and the unit while it's unused, but not the stock; logged", async () => {
		const created = await latest();
		const answer = await as(north.owner, () =>
			submit(updateMaterial, editOf(created, { unit: "m", unitPrice: 3.99, stock: 99 })),
		);
		expect(answer).toMatchObject({ status: 303, location: `/materials/${created.sku}` });
		expect(answer.refreshed).toContain("getMaterial");
		expect(await material(created.sku)).toMatchObject({ unit: "m", unit_price: 399, stock: 4 });
		const [, updated] = await logOf(created.id);
		expect(updated.action).toBe("updated");
		expect(JSON.parse(updated.changes!)).toMatchObject({
			unit: ["pcs", "m"],
			unitPrice: [1250, 399],
		});
	});

	test("the unit of a material that orders use stays", async () => {
		const busy = await busiest();
		const before = await snapshot(busy.id);
		const answer = await as(north.owner, () =>
			submit(updateMaterial, editOf(busy, { unit: busy.unit === "kg" ? "l" : "kg" })),
		);
		expect(answer.status).toBe(400);
		expect(answer.issues).toEqual([
			{
				name: "unit",
				path: ["unit"],
				message: `Can't change the unit: ${await ordersUsing(busy.id)} orders count this material in ${busy.unit}`,
			},
		]);
		expect(await snapshot(busy.id)).toEqual(before);
	});

	test("nor does a unit of whole pieces come to a history in part pieces", async () => {
		const created = await latest();
		await as(north.owner, () => submit(receiveStock, { id: String(created.id), quantity: 8.75 }));
		const before = await snapshot(created.id);
		const form = editOf(await material(created.sku), { unit: "pcs" });
		const answer = await as(north.owner, () => submit(updateMaterial, form));
		expect(answer.issues).toEqual([
			{
				name: "unit",
				path: ["unit"],
				message: "Whole pieces only: the stock history has part pieces",
			},
		]);
		expect(await snapshot(created.id)).toEqual(before);
	});
});

/** The material this file made last, in North. */
const latest = async () =>
	(
		await rows<Material>(
			`select * from material where organization_id = ? and name = ? order by id desc limit 1`,
			[northId, "Test gasket (materials spec)"],
		)
	)[0];

describe("stock", () => {
	test("received, it's added with its note, by whoever received it; logged", async () => {
		const created = await latest();
		const answer = await as(north.owner, () =>
			submit(receiveStock, { id: String(created.id), quantity: 2.25, note: " Delivery 1234 " }),
		);
		expect(answer).toMatchObject({ status: 200 });
		expect(answer.refreshed).toEqual(expect.arrayContaining(["getMaterial", "getSubjectActivity"]));
		expect((await material(created.sku)).stock).toBeCloseTo(created.stock + 2.25, 2);
		expect((await movements(created.id))[0]).toEqual({
			kind: "receipt",
			quantity: 2.25,
			note: "Delivery 1234",
			user: north.owner.email,
		});
		const entry = (await logOf(created.id)).at(-1)!;
		expect(entry).toMatchObject({ action: "stock_received", note: "Delivery 1234" });
		expect(JSON.parse(entry.changes!)).toEqual({ stock: [created.stock, created.stock + 2.25] });
	});

	test("counted, the difference is an adjustment with the reason; the stock as it is is refused", async () => {
		const created = await latest();
		const unchanged = await as(north.owner, () =>
			submit(countStock, { id: String(created.id), counted: created.stock, note: "Yearly count" }),
		);
		expect(unchanged.issues).toEqual([
			{ name: "counted", path: ["counted"], message: "That's the stock already" },
		]);
		const count = (await movements(created.id)).length;

		const answer = await as(north.owner, () =>
			submit(countStock, { id: String(created.id), counted: 10, note: "Yearly count" }),
		);
		expect(answer.status).toBe(200);
		expect(await movements(created.id)).toHaveLength(count + 1);
		expect((await movements(created.id))[0]).toEqual({
			kind: "adjustment",
			quantity: Math.round((10 - created.stock) * 100) / 100,
			note: "Yearly count",
			user: north.owner.email,
		});
		expect((await material(created.sku)).stock).toBe(10);
		expect((await logOf(created.id)).at(-1)).toMatchObject({
			action: "stock_adjusted",
			note: "Yearly count",
		});
	});

	test("of pieces is only received and counted whole", async () => {
		const pieces = (
			await rows<Material>(
				`select * from material where organization_id = ? and unit = 'pcs' order by id limit 1`,
				[northId],
			)
		)[0];
		const before = [await snapshot(pieces.id), await movements(pieces.id)];
		const received = await as(north.owner, () =>
			submit(receiveStock, { id: String(pieces.id), quantity: 1.5 }),
		);
		expect(received.issues).toEqual([
			{ name: "quantity", path: ["quantity"], message: "Whole pieces only" },
		]);
		const counted = await as(north.owner, () =>
			submit(countStock, { id: String(pieces.id), counted: 0.5, note: "Count" }),
		);
		expect(counted.issues).toEqual([
			{ name: "counted", path: ["counted"], message: "Whole pieces only" },
		]);
		expect([await snapshot(pieces.id), await movements(pieces.id)]).toEqual(before);
	});
});

describe("deleting a material", () => {
	test("is refused while orders use it, saying how many", async () => {
		const busy = await busiest();
		const before = await snapshot(busy.id);
		const answer = await as(north.owner, () => submit(deleteMaterial, { id: String(busy.id) }));
		expect(answer.status).toBe(400);
		expect(answer.issues?.map((issue) => issue.message)).toEqual([
			`This material is used on ${await ordersUsing(busy.id)} orders, so it can't be deleted. Remove it from those orders first.`,
		]);
		expect(await snapshot(busy.id)).toEqual(before);
	});
});

describe("South", () => {
	/** A North material whose SKU South hasn't (before South makes one). */
	let victim: Material;
	beforeAll(async () => {
		[victim] = await rows<Material>(
			`select * from material m where organization_id = ? and not exists
			 (select 1 from material s where s.organization_id = ? and s.sku = m.sku)
			 order by id desc limit 1`,
			[northId, southId],
		);
	});

	test("gets a 404 for North's own SKU", async () => {
		expect(victim).toBeDefined();
		expect(await as(south.owner, () => call(getMaterial, victim.sku))).toMatchObject({
			status: 404,
		});
	});

	test("sees its own material of a SKU both have, with its own orders and history", async () => {
		const [own, other] = [await material("MAT-0001", southId), await material("MAT-0001")];
		expect(own.unit_price).not.toBe(other.unit_price);
		const page = await as(south.owner, () => data(getMaterial, "MAT-0001"));
		expect(page.material).toMatchObject({ id: own.id, unitPrice: own.unit_price });
		expect(page.usage).toHaveLength(await ordersUsing(own.id));
		expect(page.movements).toHaveLength((await movements(own.id)).length);
		const southOrders = await rows<{ number: string }>(
			`select number from "order" where organization_id = ?`,
			[southId],
		);
		const numbers = new Set(southOrders.map((row) => row.number));
		for (const row of page.usage) expect(numbers.has(row.number)).toBe(true);
	});

	test("can't save, receive, count or delete a North material by its id", async () => {
		const own = await material("MAT-0002", southId);
		const before = [await snapshot(victim.id), await movements(victim.id), await snapshot(own.id)];
		const id = String(victim.id);
		await as(south.owner, async () => {
			const answers = [
				await submit(updateMaterial, editOf(own, { id, name: "Tampered name" })),
				await submit(receiveStock, { id, quantity: 5 }),
				await submit(countStock, { id, counted: 0, note: "Tampered" }),
				await submit(deleteMaterial, { id }),
				await call(bulkDeleteMaterials, { ids: [victim.id] }),
			];
			expect(answers.slice(0, 4).map((answer) => answer.status)).toEqual([404, 404, 404, 404]);
			// The bulk delete finds none of them.
			expect(answers[4]).toMatchObject({ status: 200, data: { done: 0, missing: 1 } });
		});
		expect([await snapshot(victim.id), await movements(victim.id), await snapshot(own.id)]).toEqual(
			before,
		);
	});

	test("numbers its new material after its own, and may use a name only North has", async () => {
		const sku = await nextSku(southId);
		const answer = await as(south.owner, () =>
			submit(createMaterial, newMaterial({ name: victim.name, unitPrice: 8.25, stock: 12 })),
		);
		expect(answer).toMatchObject({ status: 303, location: `/materials/${sku}` });
		expect(await material(sku, southId)).toMatchObject({
			name: victim.name,
			unit_price: 825,
			stock: 12,
		});
	});

	test("deletes its unused material with its stock history, and only its own; logged", async () => {
		const created = await material(
			String(
				await value(`select sku from material where organization_id = ? order by id desc limit 1`, [
					southId,
				]),
			),
			southId,
		);
		expect(await movements(created.id)).toHaveLength(1);
		const answer = await as(south.owner, () => submit(deleteMaterial, { id: String(created.id) }));
		expect(answer).toMatchObject({ status: 303, location: "/materials" });
		expect(await snapshot(created.id)).toEqual([]);
		expect(await movements(created.id)).toEqual([]);
		expect(await snapshot(victim.id)).toHaveLength(1);
		expect(
			await value(
				`select action from activity where organization_id = ? and subject_type = 'material'
				 and subject_id = ? order by id desc limit 1`,
				[southId, String(created.id)],
			),
		).toBe("deleted");
		expect(await as(south.owner, () => call(getMaterial, created.sku))).toMatchObject({
			status: 404,
		});
	});
});
