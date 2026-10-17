import { rmSync } from "node:fs";

import { isHttpError } from "@sveltejs/kit";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { Tenant } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { activity, order, orderUnit } from "#lib/server/db/schema.ts";
import type { ChecklistCompleting } from "#modules/checklists/api/extensions.ts";
import {
	saveOrderChecklists,
	saveUnitChecklists,
	syncChecklists,
} from "#modules/checklists/server/checklists.ts";
import {
	answerPoint,
	completeChecklist,
	remarkChecklist,
	remarkPoint,
} from "#modules/checklists/server/field.ts";
import { updatePoint } from "#modules/checklists/server/points.ts";
import {
	checklist,
	checklistResult,
	checklistTemplate,
	checklistTemplateItem,
} from "#modules/checklists/server/schema.ts";
import { retireTemplate } from "#modules/checklists/server/templates.ts";
import { at, day, freezeNow } from "#unit/temporal-support.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// What the modules are told when a checklist is completed (`checklists.completed`): a stand-in
// for the condition module, which records the scores, contributing as the tenant's own module.
const told = vi.hoisted((): ChecklistCompleting[] => []);
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => [
		{
			id: "checklists",
			contributions: [
				{
					point: { id: "checklists.completed", kind: "save" },
					answer: async ({ tx: _tx, ...input }: ChecklistCompleting) => {
						told.push({ tx: _tx, ...input });
						return undefined;
					},
				},
			],
		},
	],
}));

// A temporary database made by the app's migrations, with two tenants' customers, units (doors,
// with a template, and a pump, without), engineers and a template of two groups.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "checklists-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const { migrate } = await import("drizzle-orm/libsql/migrator");
	const { drizzleQueued } = await import("#lib/server/db/serialize.ts");
	const schema = await import("#lib/server/db/schema.ts");
	const moduleSchema = await import("#lib/server/db/modules.gen.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.execute("pragma foreign_keys = on");
	await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at) values
			('north', 'North', 'north', 0), ('south', 'South', 'south', 0);
		insert into user (id, name, email, created_at, updated_at) values
			('u1', 'Lev', 'lev@example.test', 0, 0);
		insert into customer
			(id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values
			(1, 'north', 'C-1', 'Riedel', 'Ann', 'ann@riedel.test', '1', 'Ede', 'NL', 'enterprise'),
			(2, 'south', 'C-1', 'Other', 'Bob', 'bob@other.test', '1', 'Ede', 'NL', 'enterprise');
		insert into customer_site (id, organization_id, customer_id, name, city, country) values
			(1, 'north', 1, 'Ede', 'Ede', 'NL'), (2, 'south', 2, 'Ede', 'Ede', 'NL');
		insert into equipment_category (id, organization_id, name, specialty, position) values
			(1, 'north', 'Sectionaaldeuren', null, 0), (2, 'north', 'Pompen', null, 1),
			(3, 'south', 'Sectionaaldeuren', null, 0);
		insert into equipment (id, organization_id, serial_number, name, model, manufacturer,
			category_id, status, customer_id, site_id, installed_at, warranty_until)
		values
			(10, 'north', 'SN-10', 'Deur 10', 'M', 'Make', 1, 'operational', 1, 1, '2020-01-01', '2030-01-01'),
			(11, 'north', 'SN-11', 'Deur 11', 'M', 'Make', 1, 'operational', 1, 1, '2020-01-01', '2030-01-01'),
			(12, 'north', 'SN-12', 'Pomp 12', 'M', 'Make', 2, 'operational', 1, 1, '2020-01-01', '2030-01-01'),
			(20, 'south', 'SN-20', 'Deur 20', 'M', 'Make', 3, 'operational', 2, 2, '2020-01-01', '2030-01-01');
		insert into engineer (id, organization_id, name, email, phone, specialty, region,
			hourly_rate, hired_at, user_id)
		values
			(1, 'north', 'Lev', 'lev@example.test', '1', 'mechanical', 'C', 7000, '2020-01-01', 'u1'),
			(2, 'north', 'Bram', 'bram@example.test', '1', 'mechanical', 'C', 7000, '2020-01-01', null),
			(3, 'south', 'Sam', 'sam@example.test', '1', 'mechanical', 'C', 7000, '2020-01-01', null);
	`);
	return { db: drizzleQueued(client, { schema: { ...schema, ...moduleSchema } }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenantOf = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["engineer"],
	modules: ["checklists"],
});

let templateId: number;

beforeEach(async () => {
	locals.user = { id: "u1", name: "Lev" };
	locals.tenant = tenantOf("north");
	// The core's tables as the core would have them: by SQL, not the module's writes.
	await db.run(sql`delete from checklist`);
	await db.run(sql`delete from order_unit`);
	await db.run(sql`delete from "order"`);
	await db.delete(checklistTemplate);
	await db.run(sql`delete from activity`);
	const [template] = await db
		.insert(checklistTemplate)
		.values({
			organizationId: "north",
			name: "Sectionaaldeur",
			norm: "NEN-EN 12604",
			validityMonths: 12,
			position: 0,
		})
		.returning({ id: checklistTemplate.id });
	templateId = template.id;
	await db.insert(checklistTemplateItem).values(
		[
			["Veiligheid", "Fotocel stopt deur", 2],
			["Mechanisch", "Torsieveren gecontroleerd", 0],
			["Mechanisch", "Kabels zonder rafels", 1],
		].map(([group, text, position]) => ({
			organizationId: "north",
			templateId,
			group: String(group),
			text: String(text),
			position: Number(position),
		})),
	);
	await db.run(
		sql`insert into checklist_template_category (organization_id, category_id, template_id) values ('north', 1, ${templateId})`,
	);
});

afterEach(() => {
	vi.restoreAllMocks();
});

let numbered = 0;

/** An order of North's with `units`, as core would have it once its units are saved. */
async function orderWith(
	units: number[],
	{ type = "inspection", status = "in_progress" }: { type?: string; status?: string } = {},
): Promise<number> {
	const [created] = await db.all<{ id: number }>(
		sql`insert into "order" (organization_id, number, customer_id, engineer_id, type, status,
			priority, description)
		values ('north', ${`ORD-${++numbered}`}, 1, 1, ${type}, ${status}, 'normal', 'Keuring')
		returning id`,
	);
	await setUnits(created.id, units);
	return created.id;
}

/** Changes an order as the core would. */
const changeOrder = (id: number, column: "type" | "status", to: string) =>
	db.run(sql`update "order" set ${sql.raw(column)} = ${to} where id = ${id}`);

/** What `setOrderUnits()` does about the modules: the new units in, the hook, the old ones out. */
async function setUnits(orderId: number, units: number[]) {
	let problems: Awaited<ReturnType<typeof saveUnitChecklists>>;
	class Refused extends Error {}
	await db
		.transaction(async (tx) => {
			const had = (
				await tx
					.select({ id: orderUnit.equipmentId })
					.from(orderUnit)
					.where(eq(orderUnit.orderId, orderId))
			).map((row) => row.id);
			const added = units.filter((id) => !had.includes(id));
			const removed = had.filter((id) => !units.includes(id));
			for (const [position, equipmentId] of added.entries()) {
				await tx.run(
					sql`insert into order_unit (organization_id, order_id, customer_id, equipment_id, position)
				values ('north', ${orderId}, 1, ${equipmentId}, ${100 + position + had.length})`,
				);
			}
			problems = await saveUnitChecklists({
				tx,
				order: { id: orderId },
				equipmentIds: units,
				removed,
			});
			// Refused: the transaction stores nothing of it.
			if (problems) throw new Refused();
			for (const equipmentId of removed) {
				await tx.run(
					sql`delete from order_unit where order_id = ${orderId} and equipment_id = ${equipmentId}`,
				);
			}
		})
		.catch((error: unknown) => {
			if (!(error instanceof Refused)) throw error;
		});
	return problems;
}

const checklistsOf = (orderId: number) =>
	db
		.select()
		.from(checklist)
		.where(eq(checklist.orderId, orderId))
		.orderBy(asc(checklist.equipmentId));

const pointsOf = (checklistId: number) =>
	db
		.select()
		.from(checklistResult)
		.where(eq(checklistResult.checklistId, checklistId))
		.orderBy(asc(checklistResult.position));

/** Answers every point of a checklist `ok`. */
async function answerAll(checklistId: number) {
	for (const point of await pointsOf(checklistId)) await answerPoint(1, point.id, "ok");
}

/** The status and message of what `run` threw. */
async function thrown(run: () => Promise<unknown>) {
	try {
		await run();
	} catch (error) {
		if (isHttpError(error)) return { status: error.status, message: error.body.message };
		throw error;
	}
	return undefined;
}

describe("when an order gets its units", () => {
	test("each unit whose category has a template gets a draft, a copy of the template", async () => {
		const id = await orderWith([10, 12]);
		const [made, ...others] = await checklistsOf(id);
		expect(others).toEqual([]);
		expect(made).toMatchObject({
			organizationId: "north",
			equipmentId: 10,
			templateId,
			name: "Sectionaaldeur",
			norm: "NEN-EN 12604",
			validityMonths: 12,
			kind: "inspection",
			status: "draft",
		});
		// The points in the template's order, each group's together, with the point each came from.
		const items = await db
			.select({ id: checklistTemplateItem.id, text: checklistTemplateItem.text })
			.from(checklistTemplateItem);
		const itemOf = (text: string) => items.find((item) => item.text === text)!.id;
		expect(
			(await pointsOf(made.id)).map((point) => [
				point.group,
				point.text,
				point.position,
				point.result,
				point.templateItemId,
			]),
		).toEqual([
			["Mechanisch", "Torsieveren gecontroleerd", 0, null, itemOf("Torsieveren gecontroleerd")],
			["Mechanisch", "Kabels zonder rafels", 1, null, itemOf("Kabels zonder rafels")],
			["Veiligheid", "Fotocel stopt deur", 2, null, itemOf("Fotocel stopt deur")],
		]);
	});

	test("a maintenance order's are maintenance checklists; other orders get none", async () => {
		const maintenance = await orderWith([10], { type: "maintenance" });
		expect((await checklistsOf(maintenance))[0].kind).toBe("maintenance");
		expect(await checklistsOf(await orderWith([10], { type: "repair" }))).toEqual([]);
		expect(await checklistsOf(await orderWith([10], { status: "completed" }))).toEqual([]);
		expect(await checklistsOf(await orderWith([10], { status: "cancelled" }))).toEqual([]);
	});

	test("a retired template gives none", async () => {
		await retireTemplate(templateId);
		expect(await checklistsOf(await orderWith([10, 11]))).toEqual([]);
	});

	test("a unit it gets later gets one; one it keeps keeps its own", async () => {
		const id = await orderWith([10]);
		const [first] = await checklistsOf(id);
		await setUnits(id, [10, 11]);
		const after = await checklistsOf(id);
		expect(after.map((made) => made.equipmentId)).toEqual([10, 11]);
		expect(after[0].id).toBe(first.id);
	});

	test("a later change to the template doesn't touch the checklists made with it", async () => {
		const id = await orderWith([10]);
		const [made] = await checklistsOf(id);
		const [point] = await db
			.select()
			.from(checklistTemplateItem)
			.where(eq(checklistTemplateItem.text, "Torsieveren gecontroleerd"));
		locals.tenant = { ...tenantOf("north"), roles: ["owner"] };
		await updatePoint(point.id, { group: "Mechanisch", text: "Veren vervangen" });
		await db
			.update(checklistTemplate)
			.set({ name: "Deur", validityMonths: 6 })
			.where(eq(checklistTemplate.id, templateId));
		await retireTemplate(templateId);
		const [after] = await checklistsOf(id);
		expect(after).toMatchObject({ name: "Sectionaaldeur", validityMonths: 12 });
		expect((await pointsOf(made.id))[0].text).toBe("Torsieveren gecontroleerd");
	});
});

describe("taking units off an order", () => {
	test("takes their checklists along while nothing is answered", async () => {
		const id = await orderWith([10, 11]);
		expect(await setUnits(id, [11])).toBeUndefined();
		expect((await checklistsOf(id)).map((made) => made.equipmentId)).toEqual([11]);
	});

	test("is refused, naming the units, once a point is answered", async () => {
		const id = await orderWith([10, 11]);
		const [made] = await checklistsOf(id);
		const [point] = await pointsOf(made.id);
		await answerPoint(1, point.id, "nok");
		await db.transaction(async (tx) => {
			expect(
				await saveUnitChecklists({ tx, order: { id }, equipmentIds: [11], removed: [10] }),
			).toEqual([
				{
					message: "The checklists of Deur 10 have answers already: those units stay on the order.",
				},
			]);
		});
		expect(await checklistsOf(id)).toHaveLength(2);
	});

	test("deleting the unit's row takes the checklist and its points along", async () => {
		const id = await orderWith([10]);
		const [made] = await checklistsOf(id);
		await db.run(sql`delete from order_unit where order_id = ${id}`);
		expect(await checklistsOf(id)).toEqual([]);
		expect(await pointsOf(made.id)).toEqual([]);
	});
});

describe("changing an order's type", () => {
	test("to another kind changes its drafts' kind", async () => {
		const id = await orderWith([10]);
		await changeOrder(id, "type", "maintenance");
		await db.transaction((tx) => syncChecklists(tx, id));
		expect((await checklistsOf(id))[0].kind).toBe("maintenance");
	});

	test("away from inspection takes unanswered checklists along, refuses answered ones", async () => {
		const id = await orderWith([10, 11]);
		const [made] = await checklistsOf(id);
		await answerPoint(1, (await pointsOf(made.id))[0].id, "ok");
		await changeOrder(id, "type", "repair");
		const problems = await db.transaction((tx) => syncChecklists(tx, id));
		expect(problems).toEqual([
			{
				message:
					"The checklists of Deur 10 have answers already: the order stays an inspection or maintenance order.",
				path: ["type"],
			},
		]);
		await answerPoint(1, (await pointsOf(made.id))[0].id, null);
		expect(await db.transaction((tx) => syncChecklists(tx, id))).toBeUndefined();
		expect(await checklistsOf(id)).toEqual([]);
	});
});

describe("saving an order's status", () => {
	const saving = (id: number, status: "completed" | "in_progress" | null) =>
		db.transaction(async (tx) => {
			const [found] = await tx.select().from(order).where(eq(order.id, id));
			return saveOrderChecklists({ tx, order: found, status });
		});

	test("refuses completing it while a checklist isn't completed, naming the units", async () => {
		const id = await orderWith([10, 11]);
		const [{ number }] = await db.select().from(order).where(eq(order.id, id));
		expect(await saving(id, "completed")).toEqual([
			{
				message: `${number} can't be completed yet: the checklists of Deur 10, Deur 11 aren't completed.`,
			},
		]);
		const [first, second] = await checklistsOf(id);
		await answerAll(first.id);
		await completeChecklist(1, first.id);
		expect((await saving(id, "completed"))?.[0].message).toBe(
			`${number} can't be completed yet: the checklist of Deur 11 isn't completed.`,
		);
		await answerAll(second.id);
		await completeChecklist(1, second.id);
		expect(await saving(id, "completed")).toBeUndefined();
		expect(await saving(id, "in_progress")).toBeUndefined();
	});

	test("lets an order without checklists be completed", async () => {
		expect(await saving(await orderWith([12]), "completed")).toBeUndefined();
	});

	test("refuses deleting it once a checklist is filled in; takes drafts along", async () => {
		const id = await orderWith([10, 11]);
		expect(await saving(id, null)).toBeUndefined();
		const [made] = await checklistsOf(id);
		await answerPoint(1, (await pointsOf(made.id))[0].id, "ok");
		expect((await saving(id, null))?.[0].message).toMatch(/can't be deleted.*Deur 10/);
	});
});

describe("filling a checklist in, in the field", () => {
	test("completing needs every point answered and a remark with each rejection", async () => {
		freezeNow(at("2026-10-17 14:00"));
		const id = await orderWith([10]);
		const [made] = await checklistsOf(id);
		const points = await pointsOf(made.id);
		expect(await thrown(() => completeChecklist(1, made.id))).toEqual({
			status: 400,
			message: "3 points have no answer yet.",
		});
		await answerPoint(1, points[0].id, "nok");
		await answerPoint(1, points[1].id, "ok");
		await answerPoint(1, points[2].id, "na");
		expect(await thrown(() => completeChecklist(1, made.id))).toEqual({
			status: 400,
			message: "1 rejected point doesn't say what's wrong.",
		});
		await remarkPoint(1, points[0].id, "Draadbreuk zichtbaar bij trommel — kabelset meenemen.");
		await remarkChecklist(1, made.id, "Kabelset vervangen bij volgend bezoek.");
		await completeChecklist(1, made.id);

		const [done] = await checklistsOf(id);
		expect(done).toMatchObject({
			status: "completed",
			completedBy: 1,
			remarks: "Kabelset vervangen bij volgend bezoek.",
		});
		expect(done.completedAt).toEqual(at("2026-10-17 14:00"));
		// An inspection is valid for its template's months from today.
		expect(done.validUntil).toEqual(day("2027-10-17"));
		const [logged] = await db.select().from(activity);
		expect(logged).toMatchObject({
			action: "completed",
			subjectType: "checklist",
			subjectId: String(made.id),
			parentType: "order",
			parentId: String(id),
			changes: { status: ["draft", "completed"] },
			note: "1 point rejected",
		});
		// On record: it isn't changed again.
		expect((await thrown(() => answerPoint(1, points[1].id, "nok")))?.status).toBe(400);
		// The modules were told, in the transaction that completed it, with its points.
		expect(told.at(-1)).toMatchObject({
			checklist: { id: made.id, kind: "inspection", orderId: id, equipmentId: 10, engineerId: 1 },
			points: points.map((point, i) => ({
				templateItemId: point.templateItemId,
				result: (["nok", "ok", "na"] as const)[i],
			})),
		});
	});

	test("a module's problem refuses completing it, rolling it back", async () => {
		const id = await orderWith([10]);
		const [made] = await checklistsOf(id);
		await answerAll(made.id);
		const refusing = vi
			.spyOn(await import("#lib/server/extensions.ts"), "save")
			.mockResolvedValueOnce([{ message: "Nope." }]);
		expect(await thrown(() => completeChecklist(1, made.id))).toEqual({
			status: 400,
			message: "Nope.",
		});
		refusing.mockRestore();
		expect((await checklistsOf(id))[0].status).toBe("draft");
		expect(await db.select().from(activity)).toEqual([]);
	});

	test("a maintenance checklist makes no inspection valid", async () => {
		const id = await orderWith([10], { type: "maintenance" });
		const [made] = await checklistsOf(id);
		await answerAll(made.id);
		await completeChecklist(1, made.id);
		expect((await checklistsOf(id))[0].validUntil).toBeNull();
	});

	test("only on the engineer's own orders while in progress, in their tenant", async () => {
		const id = await orderWith([10]);
		const [made] = await checklistsOf(id);
		const [point] = await pointsOf(made.id);
		// Another engineer's: as if it didn't exist.
		expect((await thrown(() => answerPoint(2, point.id, "ok")))?.status).toBe(404);
		expect((await thrown(() => completeChecklist(2, made.id)))?.status).toBe(404);
		// Another tenant's.
		locals.tenant = tenantOf("south");
		expect((await thrown(() => answerPoint(1, point.id, "ok")))?.status).toBe(404);
		expect((await thrown(() => remarkChecklist(3, made.id, "x")))?.status).toBe(404);
		locals.tenant = tenantOf("north");
		// Not in progress.
		await changeOrder(id, "status", "scheduled");
		expect(await thrown(() => answerPoint(1, point.id, "ok"))).toMatchObject({ status: 400 });
		expect((await pointsOf(made.id))[0].result).toBeNull();
	});
});
