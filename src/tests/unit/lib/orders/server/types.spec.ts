import { rmSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
	orderTypeSetup,
	requiredOrderTypes,
	saveOrderTypeSetting,
	tenantOrderTypes,
} from "#lib/orders/server/types.ts";
import type { OrderTypeSetting } from "#lib/orders/types.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { orderTypeSetting } from "#lib/server/db/schema.ts";
import { Refused } from "#lib/server/refused.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
const logged = vi.fn();

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
vi.mock("#lib/server/activity/index.ts", () => ({
	recordActivity: (_tx: unknown, record: unknown) => logged(record),
}));

// A temporary database with the one table the settings are in.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "order-types-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.executeMultiple(`
		create table order_type_setting (
			organization_id text not null, type text not null, names text not null,
			hidden integer not null default false, primary key (organization_id, type)
		);
	`);
	return { db: drizzle(client, { schema }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant = (organizationId: string, modules: string[] = []): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["owner"],
	modules,
	orderTypes: {},
});

/** The refusal's messages by field, or none if it saved. */
async function refusal(save: Promise<unknown>) {
	try {
		await save;
	} catch (error) {
		if (error instanceof Refused) {
			return error.problems.map((found) => [found.path?.join("."), found.message]);
		}
		throw error;
	}
	return [];
}

const stored = () => db.select().from(orderTypeSetting).orderBy(orderTypeSetting.organizationId);

const save = (type: Parameters<typeof saveOrderTypeSetting>[0], setting: OrderTypeSetting) =>
	saveOrderTypeSetting(type, setting);

beforeEach(async () => {
	await db.delete(orderTypeSetting);
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenant("north");
	logged.mockClear();
});

describe("the types that must stay offered", () => {
	test("breakdowns always, for the customer portal's reports", () => {
		expect([...requiredOrderTypes([])]).toEqual([["breakdown", ["Customer portal"]]]);
	});

	test("and those of the modules that are on, with their names", () => {
		const required = requiredOrderTypes(["checklists", "maintenance", "docks", "invoices"]);
		expect(required.get("inspection")).toEqual(["Work orders", "Maintenance plans"]);
		expect(required.get("maintenance")).toEqual(["Work orders", "Maintenance plans"]);
		expect(required.get("breakdown")).toEqual(["Customer portal", "Docks"]);
		expect(required.has("survey")).toBe(false);
	});

	test("and those the modules make orders of by themselves: condition's and energy's", () => {
		const required = requiredOrderTypes(["condition", "energy"]);
		expect(required.get("maintenance")).toEqual(["Components"]);
		expect(required.get("repair")).toEqual(["Energy"]);
		expect(required.get("survey")).toEqual(["Energy"]);
	});

	test("a module that's off needs nothing", () => {
		expect(requiredOrderTypes(["invoices"]).has("inspection")).toBe(false);
	});
});

describe("saving a type's setting", () => {
	test("stores the names, trimmed and without empty ones, and logs the change", async () => {
		await save("survey", { names: { en: "  ", nl: " Offerte-opname " }, hidden: false });
		expect(await stored()).toEqual([
			{
				organizationId: "north",
				type: "survey",
				names: { nl: "Offerte-opname" },
				hidden: false,
			},
		]);
		expect(logged).toHaveBeenCalledWith({
			action: "updated",
			subject: { type: "order_type", id: "survey", label: "survey" },
			before: { name_en: null, name_nl: null, hidden: false },
			after: { name_en: null, name_nl: "Offerte-opname", hidden: false },
		});
		// This request's tenant has it at once, for what it renders next.
		expect(locals.tenant?.orderTypes).toEqual({
			survey: { names: { nl: "Offerte-opname" }, hidden: false },
		});
	});

	test("changes a setting, and leaves no row once it's back to standard", async () => {
		await save("damage", { names: {}, hidden: true });
		await save("damage", { names: { en: "Accident" }, hidden: true });
		expect((await stored()).map(({ names, hidden }) => ({ names, hidden }))).toEqual([
			{ names: { en: "Accident" }, hidden: true },
		]);
		await save("damage", { names: {}, hidden: false });
		expect(await stored()).toEqual([]);
		expect(locals.tenant?.orderTypes).toEqual({});
	});

	test("keeps to the tenant: South's save leaves North's settings alone", async () => {
		await save("survey", { names: { nl: "Opname" }, hidden: false });
		locals.tenant = tenant("south");
		await save("survey", { names: { nl: "Bezoek" }, hidden: true });
		expect((await stored()).map(({ organizationId, names }) => [organizationId, names])).toEqual([
			["north", { nl: "Opname" }],
			["south", { nl: "Bezoek" }],
		]);
	});

	test("refuses hiding a type a module that's on needs, saying which", async () => {
		locals.tenant = tenant("north", ["maintenance"]);
		expect(await refusal(save("inspection", { names: {}, hidden: true }))).toEqual([
			["hidden", "Can't be hidden: needed by Maintenance plans"],
		]);
		expect(await refusal(save("breakdown", { names: {}, hidden: true }))).toEqual([
			["hidden", "Can't be hidden: needed by Customer portal"],
		]);
		expect(await stored()).toEqual([]);
		expect(logged).not.toHaveBeenCalled();
	});

	test("hides every type but the one that's needed, which is always left", async () => {
		await db
			.insert(orderTypeSetting)
			.values(
				["repair", "maintenance", "inspection", "installation", "survey", "damage", "project"].map(
					(type) => ({ organizationId: "north", type: type as never, names: {}, hidden: true }),
				),
			);
		expect(await refusal(save("other", { names: {}, hidden: true }))).toEqual([]);
		expect(await refusal(save("breakdown", { names: {}, hidden: true }))).toEqual([
			["hidden", "Can't be hidden: needed by Customer portal"],
		]);
	});

	test("refuses a name another type has in that language", async () => {
		expect(await refusal(save("other", { names: { nl: "storing" }, hidden: false }))).toEqual([
			["names.nl", "Another type is already called storing"],
		]);
	});
});

describe("the settings as they work", () => {
	test("a type a module needs shows, also when it was hidden before the module was on", () => {
		locals.tenant = {
			...tenant("north", ["maintenance"]),
			orderTypes: {
				inspection: { names: {}, hidden: true },
				damage: { names: {}, hidden: true },
			},
		};
		expect(tenantOrderTypes()).toEqual({
			inspection: { names: {}, hidden: false },
			damage: { names: {}, hidden: true },
		});
		const setup = orderTypeSetup();
		expect(setup.find((row) => row.type === "inspection")).toEqual({
			type: "inspection",
			names: {},
			hidden: false,
			requiredBy: ["Maintenance plans"],
		});
		expect(setup.find((row) => row.type === "damage")?.hidden).toBe(true);
	});

	test("as standard for a tenant without settings", () => {
		locals.tenant = { ...tenant("north"), orderTypes: undefined };
		expect(tenantOrderTypes()).toEqual({});
	});
});
