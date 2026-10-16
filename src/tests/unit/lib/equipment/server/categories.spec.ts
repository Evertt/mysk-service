import { rmSync } from "node:fs";

import { isHttpError, isValidationError } from "@sveltejs/kit";
import { asc, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { CategoryInput } from "#lib/equipment/categories/category-schema.ts";
import {
	categoriesWithUnits,
	createCategory,
	moveCategory,
	removeCategory,
	updateCategory,
} from "#lib/equipment/server/categories.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipmentCategory } from "#lib/server/db/schema.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
const logged = vi.fn();

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
vi.mock("#lib/server/activity/log.ts", async (importOriginal) => ({
	...(await importOriginal<object>()),
	recordActivity: (_tx: unknown, record: unknown) => logged(record),
}));

// A temporary database made by the app's migrations. Not an in-memory one: libsql gives a
// transaction a connection of its own, which wouldn't see it.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "categories-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const { migrate } = await import("drizzle-orm/libsql/migrator");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at) values
			('north', 'North', 'north', 0), ('south', 'South', 'south', 0);
		insert into customer
			(id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values
			(1, 'north', 'C-1', 'Acme', 'Ann', 'ann@acme.test', '1', 'Utrecht', 'NL', 'enterprise'),
			(2, 'south', 'C-1', 'Zenith', 'Zed', 'zed@zenith.test', '1', 'Breda', 'NL', 'enterprise');
		insert into customer_site (id, organization_id, customer_id, name, city, country) values
			(1, 'north', 1, 'Utrecht', 'Utrecht', 'NL'), (2, 'south', 2, 'Breda', 'Breda', 'NL');
	`);
	return { db: drizzle(client, { schema }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["owner"],
	modules: [],
});

/** The name field's issue, as a remote form's `issue.name` makes it: here, the message. */
const nameIssue = (message: string) => message;

const input = (fields: Partial<CategoryInput> = {}): CategoryInput => ({
	name: "Sectionaaldeur",
	specialty: "mechanical",
	...fields,
});

beforeEach(async () => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenant("north");
	logged.mockClear();
	await db.run(sql`delete from equipment`);
	await db.run(sql`delete from equipment_category`);
	// North's with a gap in their places (as the migration leaves them), and South's.
	await db.run(sql`insert into equipment_category (id, organization_id, name, specialty, position)
		values (10, 'north', 'Koelmachine', 'hvac', 1), (11, 'north', 'Pomp', 'plumbing', 4),
			(12, 'north', 'Lift', 'controls', 5), (20, 'south', 'Ketel', 'plumbing', 0)`);
	await db.run(sql`insert into equipment (id, organization_id, serial_number, model, manufacturer,
			category_id, status, customer_id, site_id, installed_at, warranty_until)
		values (100, 'north', 'SN-1', 'M', 'Make', 10, 'operational', 1, 1, '2024-01-01', '2027-01-01'),
			(101, 'north', 'SN-2', 'M', 'Make', 10, 'operational', 1, 1, '2024-01-01', '2027-01-01'),
			(200, 'south', 'SN-3', 'M', 'Make', 20, 'operational', 2, 2, '2024-01-01', '2027-01-01')`);
});

/** An organization's categories in their order: id, name, specialty and place. */
const categoriesOf = (organizationId: string) =>
	db
		.select({
			id: equipmentCategory.id,
			name: equipmentCategory.name,
			specialty: equipmentCategory.specialty,
			position: equipmentCategory.position,
		})
		.from(equipmentCategory)
		.where(sql`organization_id = ${organizationId}`)
		.orderBy(asc(equipmentCategory.position), asc(equipmentCategory.id));

/** How `change` failed: its status for an HTTP error, its messages when refused. */
async function failure(change: () => Promise<unknown>) {
	try {
		await change();
		return null;
	} catch (error) {
		if (isHttpError(error)) return error.status;
		if (isValidationError(error)) return error.issues.map((issue) => issue.message);
		throw error;
	}
}

describe("categoriesWithUnits", () => {
	test("lists the tenant's categories in their order, with their units", async () => {
		expect(await categoriesWithUnits()).toEqual([
			{ id: 10, name: "Koelmachine", specialty: "hvac", unitCount: 2 },
			{ id: 11, name: "Pomp", specialty: "plumbing", unitCount: 0 },
			{ id: 12, name: "Lift", specialty: "controls", unitCount: 0 },
		]);
	});
});

describe("createCategory", () => {
	test("adds one last in the tenant's order, and logs it", async () => {
		const id = await createCategory(input(), nameIssue);
		expect((await categoriesOf("north")).at(-1)).toEqual({
			id,
			name: "Sectionaaldeur",
			specialty: "mechanical",
			position: 6,
		});
		expect(logged).toHaveBeenCalledWith({
			action: "created",
			subject: { type: "equipment_category", id, label: "Sectionaaldeur" },
		});
	});

	test("one without a specialty, as the tenant's first", async () => {
		locals.tenant = tenant("west");
		await db.run(sql`insert into organization (id, name, slug, created_at)
			values ('west', 'West', 'west', 0) on conflict do nothing`);
		const id = await createCategory(input({ specialty: null }), nameIssue);
		expect(await categoriesOf("west")).toEqual([
			{ id, name: "Sectionaaldeur", specialty: null, position: 0 },
		]);
	});

	test("refuses a name the tenant has, in any case; another tenant's is fine", async () => {
		expect(await failure(() => createCategory(input({ name: "koelMACHINE" }), nameIssue))).toEqual([
			"There's a category Koelmachine already",
		]);
		expect(await categoriesOf("north")).toHaveLength(3);
		expect(logged).not.toHaveBeenCalled();
		await createCategory(input({ name: "Ketel" }), nameIssue);
		expect((await categoriesOf("north")).map((c) => c.name)).toContain("Ketel");
	});
});

describe("updateCategory", () => {
	test("renames it and changes its specialty, and logs what changed", async () => {
		await updateCategory(11, input({ name: "Pompen", specialty: null }), nameIssue);
		expect((await categoriesOf("north"))[1]).toEqual({
			id: 11,
			name: "Pompen",
			specialty: null,
			position: 4,
		});
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "updated",
				subject: { type: "equipment_category", id: 11, label: "Pompen" },
				after: { name: "Pompen", specialty: null },
			}),
		);
	});

	test("may change the case of its own name, not take another's", async () => {
		await updateCategory(12, input({ name: "LIFT" }), nameIssue);
		expect((await categoriesOf("north"))[2].name).toBe("LIFT");
		expect(await failure(() => updateCategory(12, input({ name: "pomp" }), nameIssue))).toEqual([
			"There's a category Pomp already",
		]);
	});

	test("another tenant's is a 404, and stays as it was", async () => {
		expect(await failure(() => updateCategory(20, input(), nameIssue))).toBe(404);
		expect(await categoriesOf("south")).toEqual([
			{ id: 20, name: "Ketel", specialty: "plumbing", position: 0 },
		]);
		expect(logged).not.toHaveBeenCalled();
	});
});

describe("moveCategory", () => {
	test("moves it past its neighbour, numbering the places afresh, and logs each that moved", async () => {
		await moveCategory(12, "up");
		expect((await categoriesOf("north")).map((c) => [c.id, c.position])).toEqual([
			[10, 0],
			[12, 1],
			[11, 2],
		]);
		expect(logged.mock.calls.map(([record]) => [record.subject.id, record.after])).toEqual([
			[10, { position: 0 }],
			[12, { position: 1 }],
			[11, { position: 2 }],
		]);
	});

	test("down, too", async () => {
		await moveCategory(10, "down");
		expect((await categoriesOf("north")).map((c) => c.id)).toEqual([11, 10, 12]);
	});

	test("changes nothing for the first up or the last down", async () => {
		await moveCategory(10, "up");
		await moveCategory(12, "down");
		expect((await categoriesOf("north")).map((c) => [c.id, c.position])).toEqual([
			[10, 1],
			[11, 4],
			[12, 5],
		]);
		expect(logged).not.toHaveBeenCalled();
	});

	test("another tenant's is a 404", async () => {
		expect(await failure(() => moveCategory(20, "up"))).toBe(404);
	});
});

describe("removeCategory", () => {
	test("deletes one without units, and logs it", async () => {
		await removeCategory(11);
		expect((await categoriesOf("north")).map((c) => c.id)).toEqual([10, 12]);
		expect(logged).toHaveBeenCalledWith({
			action: "deleted",
			subject: { type: "equipment_category", id: 11, label: "Pomp" },
		});
	});

	test("refuses one that units have, saying how many", async () => {
		expect(await failure(() => removeCategory(10))).toEqual([
			"Koelmachine can't be deleted while 2 units have it. Give them another category first.",
		]);
		expect(await categoriesOf("north")).toHaveLength(3);
	});

	test("another tenant's is a 404", async () => {
		expect(await failure(() => removeCategory(20))).toBe(404);
		expect(await categoriesOf("south")).toHaveLength(1);
	});
});
