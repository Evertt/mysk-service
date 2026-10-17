import { rmSync } from "node:fs";

import { eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { asSystem, type Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { activity, order } from "#lib/server/db/schema.ts";
import { dockState as stateOfFacts } from "#modules/docks/model.ts";
import { dockEscalation, dockEvent, dockSession, dockState } from "#modules/docks/server/schema.ts";
import { docksSimulation } from "#modules/docks/server/simulation.ts";
import { freezeNow } from "#unit/temporal-support.ts";

// No request: the simulation runs as the system (`asSystem()`).
vi.mock("$app/server", () => ({
	getRequestEvent: () => {
		throw new Error("Asked for a request");
	},
}));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({ generatedServerModules: () => [] }));

// A temporary database made by the app's migrations: North has the demo's four Salvo docks, each
// with a door, and a dock without Salvo; South has a DOCK 05 of its own.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "docks-simulation-spec-"));
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
		insert into organization_module (organization_id, module_id) values
			('north', 'docks'), ('south', 'docks');
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
			(10, 'north', 'D-21', 'SPU F42', 'Hörmann', 1, 'operational', 1, 1, '2020-01-01', '2022-01-01'),
			(11, 'north', 'D-22', 'SPU F42', 'Hörmann', 1, 'operational', 1, 1, '2020-01-01', '2022-01-01'),
			(12, 'north', 'D-23', 'SPU F42', 'Hörmann', 1, 'operational', 1, 1, '2020-01-01', '2022-01-01'),
			(13, 'north', 'D-24', 'SPU F42', 'Hörmann', 1, 'operational', 1, 1, '2020-01-01', '2022-01-01'),
			(20, 'south', 'D-99', 'SPU F42', 'Hörmann', 2, 'operational', 2, 2, '2020-01-01', '2022-01-01');
		insert into dock_position (id, organization_id, site_id, code, position, door_id,
			door_organization_id, scp_code)
		values
			(1, 'north', 1, 'DOCK 05', 'P-05', 10, 'north', 'SCP-05'),
			(2, 'north', 1, 'DOCK 06', 'P-06', 11, 'north', 'SCP-06'),
			(3, 'north', 1, 'DOCK 07', 'P-07', 12, 'north', 'SCP-07'),
			(4, 'north', 1, 'DOCK 08', 'P-08', 13, 'north', 'SCP-08'),
			(5, 'north', 1, 'DOCK 01', 'P-01', null, null, null),
			(6, 'south', 2, 'DOCK 05', 'P-05', 20, 'south', 'SCP-05');
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
	modules: ["docks"],
});
const north = <T>(work: () => Promise<T>) => asSystem(tenant("north"), work);

/** A moment, `minutes` after 08:00 UTC on a fixed day: the specs' clock. */
const t = (minutes: number) => Temporal.Instant.from("2026-10-17T08:00:00Z").add({ minutes });

/** Resets North's docks at `t(0)`. */
async function reset() {
	freezeNow(t(0));
	await north(() => docksSimulation.reset());
}

/** Ticks North's simulation a minute at a time from `start` for `minutes`, at `speed`. */
async function tick(start: number, minutes: number, speed = 1) {
	for (let at = start + 1; at <= start + minutes; at++) {
		freezeNow(t(at));
		await north(() => docksSimulation.tick({ from: t(at - 1), to: t(at), speed, startedAt: t(0) }));
	}
}

/** North's docks by code: their facts as stored, and whether a truck is at them. */
async function board() {
	const states = await db.select().from(dockState).where(eq(dockState.organizationId, "north"));
	const open = await db.select().from(dockSession).where(isNull(dockSession.checkedOutAt));
	const codes: Record<number, string> = { 1: "DOCK 05", 2: "DOCK 06", 3: "DOCK 07", 4: "DOCK 08" };
	return Object.fromEntries(
		states.map((state) => {
			const occupied = open.some((session) => session.dockId === state.dockId);
			return [codes[state.dockId], { ...state, state: stateOfFacts(state, occupied) }];
		}),
	);
}

beforeEach(async () => {
	await db.delete(dockEscalation);
	await db.delete(dockEvent);
	await db.delete(dockSession);
	await db.delete(dockState);
	// The core's tables in SQL: a module writes only its own through drizzle (boundaries.spec.ts).
	await db.$client.executeMultiple(`delete from "order"; delete from activity;`);
});
afterEach(() => vi.restoreAllMocks());

describe("reset", () => {
	test("puts the four docks in the mockup's states, without a notice or an order", async () => {
		await reset();
		const docks = await board();
		expect(Object.keys(docks).toSorted()).toEqual(["DOCK 05", "DOCK 06", "DOCK 07", "DOCK 08"]);
		expect(docks["DOCK 05"]).toMatchObject({
			state: "loading",
			doorOpenSince: t(0).subtract({ seconds: 1420 }),
		});
		expect(docks["DOCK 06"]).toMatchObject({
			state: "occupied",
			keyLocation: "driver",
			doorOpenSince: t(0).subtract({ seconds: 2680 }),
			doorAlert: "amber",
		});
		expect(docks["DOCK 07"]).toMatchObject({ state: "free", doorOpenSince: null });
		expect(docks["DOCK 08"]).toMatchObject({
			state: "fault",
			faultReason: "Sleutelfout",
			doorOpenSince: t(0).subtract({ seconds: 5240 }),
			doorAlert: "red",
		});
		const plates = (await db.select().from(dockSession).where(isNull(dockSession.checkedOutAt)))
			.map((session) => session.plate ?? "")
			.toSorted((a, b) => a.localeCompare(b));
		expect(plates).toEqual(["12-VDK-3", "51-JPR-9", "84-BNX-7"]);

		// The rules have nothing to do: the open doors' bands were acted on.
		await tick(0, 1);
		expect(await db.select().from(order)).toEqual([]);
		expect(await db.select().from(activity)).toEqual([]);
	});

	test("a second reset leaves no overlapping sessions behind", async () => {
		await reset();
		await tick(0, 30, 5);
		await reset();
		const sessions = await db
			.select()
			.from(dockSession)
			.where(eq(dockSession.organizationId, "north"));
		expect(sessions.filter((each) => !each.checkedOutAt)).toHaveLength(3);
		for (const session of sessions.filter((each) => !each.checkedOutAt)) {
			const ended = sessions.filter(
				(each) =>
					each.dockId === session.dockId &&
					each.checkedOutAt &&
					Temporal.Instant.compare(each.checkedOutAt, session.checkedInAt) > 0,
			);
			expect(ended).toEqual([]);
		}
	});

	test("leaves another tenant's docks alone", async () => {
		await reset();
		expect(await db.select().from(dockState).where(eq(dockState.organizationId, "south"))).toEqual(
			[],
		);
		expect(
			await db.select().from(dockSession).where(eq(dockSession.organizationId, "south")),
		).toEqual([]);
	});
});

describe("tick", () => {
	test("moves the docks on through the feed: events stored, sessions and states changed", async () => {
		await reset();
		await tick(0, 20);
		const events = await db.select().from(dockEvent).where(eq(dockEvent.organizationId, "north"));
		expect(events.length).toBeGreaterThan(4);
		expect(events.every((event) => event.outcome === "applied")).toBe(true);
		const docks = await board();
		// DOCK 08's key fault has cleared, DOCK 06's driver has locked.
		expect(docks["DOCK 08"].scpOnline).toBe(true);
		expect(docks["DOCK 06"].locked || docks["DOCK 06"].doorOpenSince === null).toBe(true);
		// The dock without Salvo, and South's, get no events.
		expect(events.some((event) => event.dockId === 5)).toBe(false);
		expect(await db.select().from(dockEvent).where(eq(dockEvent.organizationId, "south"))).toEqual(
			[],
		);
	});

	test.each([1, 10])(
		"over hours at %d×, the rules notice long doors, one open order per door at most",
		async (speed) => {
			await reset();
			await tick(0, 240, speed);
			const notices = await db.select().from(activity).where(eq(activity.action, "door_alert"));
			expect(notices.length).toBeGreaterThan(0);
			const escalations = await db.select().from(dockEscalation);
			const doors = escalations.map((each) => each.equipmentId);
			expect(new Set(doors).size).toBe(doors.length);
			const orders = await db.select().from(order);
			expect(orders.length).toBe(escalations.length);
			expect(orders.every((each) => each.type === "breakdown")).toBe(true);
		},
	);
});
