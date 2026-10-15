import { rmSync } from "node:fs";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { asSystem, type Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { activity, order } from "#lib/server/db/schema.ts";
import { runDueMaintenance } from "#modules/maintenance/server/automatic.ts";
import { maintenancePlan, maintenanceSettings } from "#modules/maintenance/server/schema.ts";
import { day } from "#unit/temporal-support.ts";

// No request: the system runs the job (`asSystem()`), so nothing may ask for one.
vi.mock("$app/server", () => ({
	getRequestEvent: () => {
		throw new Error("The daily job asked for a request");
	},
}));
// No module takes part in the core's hooks (an order's parts, prices).
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({ generatedServerModules: () => [] }));
const sent = vi.hoisted(() => [] as { to: string; subject: string; text: string }[]);
vi.mock("#lib/server/mail/index.ts", () => ({
	sendMail: async (mail: { to: string; subject: string; text: string }) => void sent.push(mail),
}));

// A temporary database made by the app's migrations. Not an in-memory one: libsql gives a
// transaction a connection of its own, which wouldn't see it.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "automatic-spec-"));
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
	await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at) values
			('north', 'North', 'north', 0), ('south', 'South', 'south', 0);
		insert into customer
			(id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values
			(1, 'north', 'C-1', 'Acme', 'Ann', 'ann@acme.test', '1', 'Utrecht', 'NL', 'enterprise'),
			(2, 'south', 'C-1', 'Zenith', 'Zed', 'zed@zenith.test', '1', 'Breda', 'NL', 'enterprise');
		insert into equipment (id, organization_id, serial_number, model, manufacturer, category,
			status, customer_id, installed_at, warranty_until)
		values
			(10, 'north', 'SN-10', 'M', 'Make', 'boiler', 'operational', 1, '2020-01-01', '2030-01-01'),
			(20, 'south', 'SN-20', 'M', 'Make', 'boiler', 'operational', 2, '2020-01-01', '2030-01-01');
	`);
	return { db: drizzleQueued(client, { schema: { ...schema, ...moduleSchema } }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId === "north" ? "North" : "South",
	slug: organizationId,
	roles: [],
	modules: ["maintenance"],
});

const today = day("2026-10-15");

/** The daily job in `organizationId`, as the system, on `on`. */
const run = (organizationId = "north", on = today) =>
	asSystem(tenant(organizationId), () => runDueMaintenance({ today: on }));

/** Adds a plan to North's unit, due on `due`, every `months`. */
async function addPlan(due: string, fields: Partial<typeof maintenancePlan.$inferInsert> = {}) {
	const nextDueOn = day(due);
	const [plan] = await db
		.insert(maintenancePlan)
		.values({
			organizationId: "north",
			equipmentId: 10,
			orderType: "maintenance",
			description: "Annual boiler service",
			intervalMonths: 12,
			nextDueOn,
			anchorDay: nextDueOn.day,
			...fields,
		})
		.returning();
	return plan;
}

const ordersOf = (organizationId = "north") =>
	db
		.select({ number: order.number, status: order.status, description: order.description })
		.from(order)
		.where(eq(order.organizationId, organizationId));

/** Sets North's settings (made with the defaults first). */
async function settings(values: Partial<typeof maintenanceSettings.$inferInsert>) {
	await db
		.insert(maintenanceSettings)
		.values({ organizationId: "north", ...values })
		.onConflictDoUpdate({ target: maintenanceSettings.organizationId, set: values });
}

beforeEach(async () => {
	sent.length = 0;
	await db.delete(maintenancePlan);
	await db.delete(maintenanceSettings);
	// The core's tables, as the fixture (the module itself writes them only through core's services).
	await db.$client.executeMultiple(`delete from activity; delete from "order";`);
});

describe("runDueMaintenance", () => {
	test("does nothing while the tenant hasn't turned automatic orders on", async () => {
		await addPlan("2026-10-01");
		expect(await run()).toEqual({});
		expect(await ordersOf()).toEqual([]);
	});

	test("makes the orders of the plans due within the lead time, once", async () => {
		await settings({ autoCreate: true, leadDays: 30 });
		const overdue = await addPlan("2026-09-01");
		const soon = await addPlan("2026-11-13", { description: "Filter change" });
		const later = await addPlan("2026-11-14", { description: "Later" });
		const paused = await addPlan("2026-10-01", { paused: true, description: "Paused" });

		expect(await run()).toEqual({ "maintenance.orders": 2 });
		const orders = await ordersOf();
		expect(orders.map((made) => made.description).sort()).toEqual([
			"Annual boiler service",
			"Filter change",
		]);
		expect(orders.every((made) => made.status === "quote")).toBe(true);

		const plans = await db.select().from(maintenancePlan);
		const byId = new Map(plans.map((plan) => [plan.id, plan]));
		expect(byId.get(overdue.id)!.nextDueOn).toEqual(day("2027-09-01"));
		expect(byId.get(soon.id)!.nextDueOn).toEqual(day("2027-11-13"));
		expect(byId.get(later.id)!.lastOrderId).toBeNull();
		expect(byId.get(paused.id)!.lastOrderId).toBeNull();

		// Again the same day: nothing more.
		expect(await run()).toEqual({ "maintenance.orders": 0 });
		expect(await ordersOf()).toHaveLength(2);
		// The next day, the later plan is within the lead time too, and only it gets an order.
		expect(await run("north", today.add({ days: 1 }))).toEqual({ "maintenance.orders": 1 });
		expect(await ordersOf()).toHaveLength(3);

		const [stored] = await db.select().from(maintenanceSettings);
		expect(stored.lastRunOrders).toBe(1);
		expect(stored.lastRunAt).not.toBeNull();
	});

	test("a plan still due gets its next order only once its last one is finished", async () => {
		await settings({ autoCreate: true, leadDays: 60 });
		// Monthly, and long overdue: still due after the first order.
		await addPlan("2026-07-15", { intervalMonths: 1 });

		expect(await run()).toEqual({ "maintenance.orders": 1 });
		expect(await run()).toEqual({ "maintenance.orders": 0 });

		// Someone finishes the order.
		await db.$client.execute(`update "order" set status = 'completed'`);
		expect(await run()).toEqual({ "maintenance.orders": 1 });
		const [plan] = await db.select().from(maintenancePlan);
		expect(plan.nextDueOn).toEqual(day("2026-09-15"));
		expect(await ordersOf()).toHaveLength(2);
	});

	test("logs the orders and the plans as the system's, without a user", async () => {
		await settings({ autoCreate: true });
		await addPlan("2026-10-01");
		await run();

		const entries = await db
			.select({
				type: activity.subjectType,
				action: activity.action,
				userId: activity.userId,
				userName: activity.userName,
			})
			.from(activity)
			.where(eq(activity.organizationId, "north"));
		expect(entries).toEqual(
			expect.arrayContaining([
				{ type: "order", action: "created", userId: null, userName: "" },
				{ type: "maintenancePlan", action: "updated", userId: null, userName: "" },
			]),
		);
	});

	test("emails the customers only when the tenant wants it", async () => {
		await settings({ autoCreate: true });
		await addPlan("2026-10-01");
		await run();
		expect(sent).toEqual([]);

		await settings({ remindCustomers: true });
		await addPlan("2026-10-02", { description: "Inspection" });
		await run();
		expect(sent).toEqual([
			expect.objectContaining({ to: "ann@acme.test", subject: expect.stringContaining("SN-10") }),
		]);
		expect(sent[0].text).toContain("Inspection");
	});

	test("stays in its tenant", async () => {
		await settings({ autoCreate: true });
		await addPlan("2026-10-01");
		// South has automatic orders off (no settings yet) and no plans: nothing happens there.
		expect(await run("south")).toEqual({});
		expect(await ordersOf("south")).toEqual([]);

		await db
			.update(maintenanceSettings)
			.set({ autoCreate: true })
			.where(eq(maintenanceSettings.organizationId, "south"));
		expect(await run("south")).toEqual({ "maintenance.orders": 0 });
		expect(await ordersOf("south")).toEqual([]);
		// North's plan is still due for North.
		const [plan] = await db
			.select()
			.from(maintenancePlan)
			.where(eq(maintenancePlan.organizationId, "north"));
		expect(plan.lastOrderId).toBeNull();
	});
});
