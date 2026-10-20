import { rmSync } from "node:fs";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { asSystem, type Tenant } from "#lib/server/auth/index.ts";
import {
	integrationTenant,
	issueIntegrationToken,
	revokeIntegrationToken,
} from "#lib/server/auth/integrations.ts";
import { db } from "#lib/server/db/index.ts";
import { activity, integrationToken, order } from "#lib/server/db/schema.ts";
import { UnknownCodes } from "#lib/server/modules/integrations.ts";
import { parseBatch } from "#modules/docks/server/events.ts";
import { applyBatch } from "#modules/docks/server/ingest.ts";
import { checkDoors } from "#modules/docks/server/rules.ts";
import { dockEscalation, dockEvent, dockSession, dockState } from "#modules/docks/server/schema.ts";
import { freezeNow } from "#unit/temporal-support.ts";

// No request: the system makes the changes (`asSystem()`), so nothing may ask for one.
vi.mock("$app/server", () => ({
	getRequestEvent: () => {
		throw new Error("Asked for a request");
	},
}));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({ generatedServerModules: () => [] }));

// A temporary database made by the app's migrations (see the maintenance module's spec): North
// and South each with a customer, a site, a door and a dock; only North has the module.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "docks-spec-"));
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
		insert into organization_module (organization_id, module_id) values ('north', 'docks');
		insert into customer
			(id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values
			(1, 'north', 'C-1', 'Acme', 'Ann', 'ann@acme.test', '1', 'Utrecht', 'NL', 'enterprise'),
			(2, 'south', 'C-1', 'Zenith', 'Zed', 'zed@zenith.test', '1', 'Breda', 'NL', 'enterprise');
		insert into customer_site (id, organization_id, customer_id, name, city, country) values
			(1, 'north', 1, 'Utrecht', 'Utrecht', 'NL'), (2, 'south', 2, 'Breda', 'Breda', 'NL');
		insert into equipment_category (id, organization_id, name, specialty, position) values
			(1, 'north', 'Sectionaaldeur', 'mechanical', 0), (2, 'south', 'Sectionaaldeur', 'mechanical', 0);
		insert into equipment (id, organization_id, serial_number, model, manufacturer, category_id,
			status, customer_id, site_id, installed_at, warranty_until)
		values
			(10, 'north', 'D-17', 'SPU F42', 'Hörmann', 1, 'operational', 1, 1, '2020-01-01', '2022-01-01'),
			(20, 'south', 'D-99', 'SPU F42', 'Hörmann', 2, 'operational', 2, 2, '2020-01-01', '2022-01-01');
		insert into dock_position (id, organization_id, site_id, code, position, door_id,
			door_organization_id, scp_code)
		values
			(1, 'north', 1, 'DOCK 05', 'P-05', 10, 'north', 'SCP-05'),
			(2, 'north', 1, 'DOCK 06', 'P-06', null, null, 'SCP-06'),
			(3, 'south', 2, 'DOCK 09', 'P-09', 20, 'south', 'SCP-09');
	`);
	return { db: drizzleQueued(client, { schema: { ...schema, ...moduleSchema } }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: [],
	modules: organizationId === "north" ? ["docks"] : [],
});
const north = <T>(work: () => Promise<T>) => asSystem(tenant("north"), work);

/** A moment, `minutes` after 08:00 UTC on a fixed day: the specs' clock. */
const t = (minutes: number) => Temporal.Instant.from("2026-10-17T08:00:00Z").add({ minutes });

let counter = 0;
const event = (type: string, dock: string, at: Temporal.Instant, payload?: object) => ({
	id: `e-${++counter}`,
	type,
	dock,
	at: at.toString(),
	...(payload ? { payload } : {}),
});

/** Validates and applies a batch in North, as the endpoint does, at `now`. */
async function ingest(events: object[], now = t(600)) {
	const parsed = parseBatch({ events }, now);
	if ("issues" in parsed) throw new Error(JSON.stringify(parsed.issues));
	return north(() => applyBatch(parsed.events, now));
}

const stateOf = async (dockId: number) =>
	(await db.select().from(dockState).where(eq(dockState.dockId, dockId)))[0];
const sessionsOf = (dockId: number) =>
	db.select().from(dockSession).where(eq(dockSession.dockId, dockId)).orderBy(dockSession.id);

beforeEach(async () => {
	await db.delete(dockEscalation);
	await db.delete(dockEvent);
	await db.delete(dockSession);
	await db.delete(dockState);
	// The core's tables in SQL: a module writes only its own through drizzle (boundaries.spec.ts).
	await db.$client.executeMultiple(
		`delete from "order"; delete from activity; delete from integration_token;`,
	);
});
afterEach(() => vi.restoreAllMocks());

describe("applying a batch", () => {
	test("updates the dock's state and its session, in the events' time order", async () => {
		const result = await ingest([
			// Sent out of order: applied by time.
			event("lock", "DOCK 05", t(3)),
			event("check_in", "DOCK 05", t(0), { plate: "84-BNX-7", reference: "WB-20416" }),
			event("key_moved", "DOCK 05", t(2), { to: "scp" }),
			event("door_open", "DOCK 05", t(5)),
		]);
		expect(result).toMatchObject({ applied: 4, duplicates: 0, stale: 0 });
		expect(await stateOf(1)).toMatchObject({
			locked: true,
			doorOpenSince: t(5),
			keyLocation: "scp",
			lastEventAt: t(5),
		});
		const [session] = await sessionsOf(1);
		expect(session).toMatchObject({
			plate: "84-BNX-7",
			checkedInAt: t(0),
			lockedAt: t(3),
			doorOpenedAt: t(5),
			checkedOutAt: null,
		});

		await ingest([
			event("door_close", "DOCK 05", t(25)),
			event("unlock", "DOCK 05", t(26)),
			event("check_out", "DOCK 05", t(28)),
			event("check_in", "DOCK 05", t(30), { plate: "VX-218-K" }),
		]);
		const sessions = await sessionsOf(1);
		expect(sessions.map((each) => [each.plate, each.checkedOutAt, each.doorOpenSeconds])).toEqual([
			["84-BNX-7", t(28), 20 * 60],
			["VX-218-K", null, 0],
		]);
		expect(await stateOf(1)).toMatchObject({ locked: false, doorOpenSince: null });
	});

	test("check-in and check-out in one batch make one finished session", async () => {
		await ingest([
			event("check_in", "DOCK 06", t(0), { plate: "AB-12-C" }),
			event("check_out", "DOCK 06", t(10)),
			event("check_in", "DOCK 06", t(12), { plate: "DE-34-F" }),
			event("check_out", "DOCK 06", t(20)),
		]);
		const sessions = await sessionsOf(2);
		expect(sessions.map((each) => [each.plate, each.checkedOutAt])).toEqual([
			["AB-12-C", t(10)],
			["DE-34-F", t(20)],
		]);
	});

	test("is idempotent per event id, also within a batch", async () => {
		const events = [event("check_in", "DOCK 05", t(0)), event("lock", "DOCK 05", t(1))];
		const first = await ingest([...events, events[1]]);
		expect(first).toMatchObject({ applied: 2, duplicates: 1 });
		const again = await ingest(events);
		expect(again).toMatchObject({ applied: 0, duplicates: 2 });
		expect(again.results.map((each) => each.outcome)).toEqual(["duplicate", "duplicate"]);
		expect(await sessionsOf(1)).toHaveLength(1);
	});

	test("records an event older than the dock's last one, but doesn't apply it", async () => {
		await ingest([event("door_open", "DOCK 05", t(10))]);
		const late = await ingest([event("door_close", "DOCK 05", t(5))]);
		expect(late).toMatchObject({ applied: 0, stale: 1 });
		expect((await stateOf(1)).doorOpenSince).toEqual(t(10));
		const stored = await db.select().from(dockEvent).where(eq(dockEvent.outcome, "stale"));
		expect(stored).toHaveLength(1);
	});

	test("an event older than the dock's last one within the same second is stale too", async () => {
		const at = (milliseconds: number) => t(10).add({ milliseconds });
		await ingest([event("door_open", "DOCK 05", at(700))]);
		const late = await ingest([event("door_close", "DOCK 05", at(300))]);
		expect(late).toMatchObject({ applied: 0, stale: 1 });
		expect((await stateOf(1)).doorOpenSince).toEqual(t(10));
	});

	test("refuses a batch naming a dock the tenant doesn't have, another tenant's included", async () => {
		const parsed = parseBatch(
			{ events: [event("lock", "DOCK 05", t(0)), event("lock", "DOCK 09", t(1))] },
			t(10),
		);
		if ("issues" in parsed) throw new Error("invalid");
		const refused = north(() => applyBatch(parsed.events, t(10)));
		await expect(refused).rejects.toBeInstanceOf(UnknownCodes);
		await expect(refused).rejects.toMatchObject({ unknown: { docks: ["DOCK 09"] } });
		// Nothing of it applied, and South's dock untouched.
		expect(await stateOf(1)).toBeUndefined();
		expect(await stateOf(3)).toBeUndefined();
		expect(await db.select().from(dockEvent)).toEqual([]);
	});
});

describe("the door rules", () => {
	const ordersOnDoor = () => db.select().from(order).where(eq(order.customerId, 1));
	const notices = (action: string) =>
		db
			.select()
			.from(activity)
			.where(eq(activity.action, action as never));

	test("40 minutes: a notice once; 60: one breakdown order on the door", async () => {
		await ingest([event("check_in", "DOCK 05", t(0)), event("door_open", "DOCK 05", t(0))]);

		expect(await north(() => checkDoors(t(39)))).toEqual({ notices: 0, orders: [] });
		expect(await north(() => checkDoors(t(40)))).toEqual({ notices: 1, orders: [] });
		expect(await north(() => checkDoors(t(50)))).toEqual({ notices: 0, orders: [] });
		expect((await stateOf(1)).doorAlert).toBe("amber");
		expect(await notices("door_alert")).toHaveLength(1);

		const red = await north(() => checkDoors(t(60)));
		expect(red.notices).toBe(1);
		expect(red.orders).toHaveLength(1);
		expect(await north(() => checkDoors(t(90)))).toEqual({ notices: 0, orders: [] });

		const orders = await ordersOnDoor();
		expect(orders).toEqual([
			expect.objectContaining({ type: "breakdown", priority: "high", status: "quote" }),
		]);
		expect(orders[0].description).toContain("DOCK 05");
		const escalated = await notices("door_escalated");
		expect(escalated).toEqual([
			expect.objectContaining({ subjectType: "dock", subjectLabel: "DOCK 05", userId: null }),
		]);
	});

	test("at most one open such order per door: the next opening adds none while it's open", async () => {
		await ingest([event("door_open", "DOCK 05", t(0))]);
		await north(() => checkDoors(t(61)));
		await ingest([event("door_close", "DOCK 05", t(70)), event("door_open", "DOCK 05", t(80))]);
		const second = await north(() => checkDoors(t(145)));
		// Escalated (logged), but no second order.
		expect(second).toEqual({ notices: 1, orders: [] });
		expect(await ordersOnDoor()).toHaveLength(1);

		// Once the order is done, the next hour-long opening makes a new one.
		await db.$client.execute(`update "order" set status = 'completed'`);
		await ingest([event("door_close", "DOCK 05", t(150)), event("door_open", "DOCK 05", t(160))]);
		expect((await north(() => checkDoors(t(221)))).orders).toHaveLength(1);
		expect(await ordersOnDoor()).toHaveLength(2);
	});

	test("a dock without a door unit is escalated without an order", async () => {
		await ingest([event("door_open", "DOCK 06", t(0))]);
		expect(await north(() => checkDoors(t(65)))).toEqual({ notices: 1, orders: [] });
	});

	test("run at the server's time by default", async () => {
		await ingest([event("door_open", "DOCK 05", t(0))]);
		freezeNow(t(41));
		expect(await north(() => checkDoors())).toEqual({ notices: 1, orders: [] });
	});
});

describe("integration tokens", () => {
	const request = (token?: string) =>
		new Request("http://localhost/docks/ingest", {
			method: "POST",
			headers: token ? { authorization: `Bearer ${token}` } : {},
		});
	const statusOf = (promise: Promise<unknown>) =>
		promise.then(
			() => 200,
			(error: { status?: number }) => error.status,
		);

	test("a token finds its tenant; only its hash is stored", async () => {
		const { token, prefix } = await north(() => issueIntegrationToken("docks", "Salvo"));
		expect(token).toMatch(/^fwi_[0-9a-f]{40}$/);
		expect(token.startsWith(prefix)).toBe(true);
		const [row] = await db.select().from(integrationToken);
		expect(row.tokenHash).not.toContain(token.slice(4));
		expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);

		const found = await integrationTenant(request(token), "docks");
		expect(found).toMatchObject({ organizationId: "north", modules: ["docks"], roles: [] });
		expect((await db.select().from(integrationToken))[0].lastUsedAt).not.toBeNull();
	});

	test("a missing, unknown, other module's or revoked token is a 401", async () => {
		const { token } = await north(() => issueIntegrationToken("docks", "Salvo"));
		expect(await statusOf(integrationTenant(request(), "docks"))).toBe(401);
		expect(await statusOf(integrationTenant(request("fwi_nope"), "docks"))).toBe(401);
		expect(await statusOf(integrationTenant(request(token.slice(4)), "docks"))).toBe(401);
		expect(await statusOf(integrationTenant(request(token), "maintenance"))).toBe(401);

		const [row] = await db.select().from(integrationToken);
		await north(() => revokeIntegrationToken("docks", row.id));
		expect(await statusOf(integrationTenant(request(token), "docks"))).toBe(401);
		// Revoked once: a second revoke finds nothing.
		expect(await statusOf(north(() => revokeIntegrationToken("docks", row.id)))).toBe(404);
	});

	test("a tenant that no longer has the module gets a 404", async () => {
		const { token } = await north(() => issueIntegrationToken("docks", "Salvo"));
		await db.$client.execute(`delete from organization_module`);
		try {
			expect(await statusOf(integrationTenant(request(token), "docks"))).toBe(404);
		} finally {
			await db.$client.execute(
				`insert into organization_module (organization_id, module_id) values ('north', 'docks')`,
			);
		}
	});

	test("a tenant can't revoke another tenant's token", async () => {
		await north(() => issueIntegrationToken("docks", "Salvo"));
		const [row] = await db.select().from(integrationToken);
		const south = asSystem(tenant("south"), () => revokeIntegrationToken("docks", row.id));
		expect(await statusOf(south)).toBe(404);
		expect((await db.select().from(integrationToken))[0].revokedAt).toBeNull();
	});
});
