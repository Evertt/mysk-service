/**
 * Storing a gateway's batch (`server/ingest.ts`) and the alerts it raises (`server/evaluate.ts`),
 * against a database made by the app's migrations: readings replace their interval, door events
 * are stored once, a zone's alert is raised once per hour (and grows from near to over), a door's
 * once per opening, only for the last day; a batch can name only its tenant's site and codes; and
 * the energy module's integration tokens only feed their own tenant, and only while it has the
 * module.
 */
import { rmSync } from "node:fs";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { asSystem, type Tenant } from "#lib/server/auth/index.ts";
import {
	integrationTenant,
	issueIntegrationToken,
	revokeIntegrationToken,
} from "#lib/server/auth/integrations.ts";
import { db } from "#lib/server/db/index.ts";
import { activity } from "#lib/server/db/schema.ts";
import { parseBatch } from "#modules/energy/ingest/format.ts";
import { storeBatch } from "#modules/energy/server/ingest.ts";
import { energyAlert, energyDoorEvent, energyReading } from "#modules/energy/server/schema.ts";

// No request: the system makes the changes (`asSystem()`), so nothing may ask for one.
vi.mock("$app/server", () => ({
	getRequestEvent: () => {
		throw new Error("Asked for a request");
	},
}));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({ generatedServerModules: () => [] }));

// North has the module with a site of two zones and a door; South a site with a zone of its own,
// and doesn't have the module.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "energy-spec-"));
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
		insert into organization_module (organization_id, module_id) values ('north', 'energy');
		insert into customer
			(id, organization_id, code, name, contact_name, email, phone, city, country, segment)
		values
			(1, 'north', 'C-1', 'Acme', 'Ann', 'ann@acme.test', '1', 'Ede', 'NL', 'enterprise'),
			(2, 'south', 'C-1', 'Zenith', 'Zed', 'zed@zenith.test', '1', 'Breda', 'NL', 'enterprise');
		insert into customer_site (id, organization_id, customer_id, name, city, country) values
			(1, 'north', 1, 'Ede', 'Ede', 'NL'), (2, 'south', 2, 'Breda', 'Breda', 'NL');
		insert into energy_site (id, organization_id, site_id, name, meter_name, contracted_peak_kw,
			contracted_kwh_per_year)
		values (1, 'north', 1, 'Acme Ede', 'Main', 320, 1000000),
			(2, 'south', 2, 'Zenith Breda', 'Main', 100, 100000);
		insert into energy_zone (id, organization_id, energy_site_id, code, name, floor) values
			(1, 'north', 1, 'Z-A', 'Hall A', 'Ground'), (2, 'north', 1, 'Z-B', 'Hall B', 'Ground'),
			(3, 'south', 2, 'Z-S', 'South hall', 'Ground');
		insert into energy_threshold (zone_id, organization_id, enabled, max_kw, max_kwh) values
			(1, 'north', 1, 100, 10000), (2, 'north', 0, 1, 1), (3, 'south', 1, 1, 1);
		insert into energy_door (id, organization_id, energy_site_id, zone_id, code, name, kind,
			loss_kw, threshold_minutes)
		values (1, 'north', 1, 1, 'D-1', 'Dock 1', 'sectional', 11.4, 10);
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
	modules: organizationId === "north" ? ["energy"] : [],
});
const north = <T>(work: () => Promise<T>) => asSystem(tenant("north"), work);

/** A moment `minutes` after 08:00 UTC (10:00 in Ede) on a fixed day: the specs' clock. */
const t = (minutes: number) => Temporal.Instant.from("2026-10-17T08:00:00Z").add({ minutes });
const now = t(240);

const reading = (zone: string, minutes: number, avgKw: number) => ({
	zone,
	start: t(minutes).toString(),
	avgKw,
	peakKw: avgKw * 1.05,
	kwh: avgKw / 4,
});
const door = (minutes: number, state: "open" | "closed") => ({
	door: "D-1",
	at: t(minutes).toString(),
	state,
});

/** Validates and stores a batch in North, as the endpoint does, at `now`. */
async function ingest(body: object, at = now) {
	const parsed = parseBatch({ site: 1, ...body }, at);
	if (parsed.issues) throw new Error(JSON.stringify(parsed.issues));
	return north(() => storeBatch(parsed.batch, at));
}

const alerts = () => db.select().from(energyAlert).orderBy(energyAlert.id);

beforeEach(async () => {
	await db.delete(energyAlert);
	await db.delete(energyDoorEvent);
	await db.delete(energyReading);
	// The core's tables in SQL: a module writes only its own through drizzle (boundaries.spec.ts).
	await db.$client.executeMultiple(`delete from activity; delete from integration_token;`);
});

describe("storing a batch", () => {
	test("stores the readings and events, and raises a zone's alert over its threshold", async () => {
		const outcome = await ingest({
			readings: [reading("Z-A", 0, 80), reading("Z-A", 15, 120), reading("Z-B", 0, 500)],
			doorEvents: [door(0, "open"), door(4, "closed")],
		});
		expect(outcome).toEqual({ stored: { readings: 3, doorEvents: 2, alerts: 1 } });
		const [alert] = await alerts();
		expect(alert).toMatchObject({
			organizationId: "north",
			energySiteId: 1,
			zoneId: 1,
			doorId: null,
			key: "zone:1:2026-10-17T10",
			metric: "power",
			severity: "active",
			threshold: 100,
			measured: 120,
			at: t(15),
			status: "open",
		});
		// Logged as the system's, on the site's card.
		const [entry] = await db.select().from(activity);
		expect(entry).toMatchObject({
			action: "created",
			subjectType: "energy_alert",
			subjectLabel: "Z-A",
			parentType: "energy_site",
			userId: null,
		});
	});

	test("is idempotent: the same batch again stores the same, raises nothing", async () => {
		const batch = {
			readings: [reading("Z-A", 0, 120), reading("Z-A", 15, 90)],
			doorEvents: [door(0, "open"), door(4, "closed")],
		};
		await ingest(batch);
		expect(await ingest(batch)).toEqual({ stored: { readings: 2, doorEvents: 0, alerts: 0 } });
		expect(await db.select().from(energyReading)).toHaveLength(2);
		expect(await db.select().from(energyDoorEvent)).toHaveLength(2);
		expect(await alerts()).toHaveLength(1);
	});

	test("a door event with milliseconds is stored once, also when it's sent again", async () => {
		// Stored in whole seconds: the resent one must be known by its second.
		const event = { door: "D-1", at: t(3).add({ milliseconds: 500 }).toString(), state: "open" };
		await ingest({ doorEvents: [event] });
		expect(await ingest({ doorEvents: [event] })).toEqual({
			stored: { readings: 0, doorEvents: 0, alerts: 0 },
		});
		expect(await db.select().from(energyDoorEvent)).toHaveLength(1);
	});

	test("refuses two events of a door in one state within the same second", () => {
		const at = (milliseconds: number) => t(3).add({ milliseconds }).toString();
		const parsed = parseBatch(
			{
				site: 1,
				doorEvents: [
					{ door: "D-1", at: at(200), state: "open" },
					{ door: "D-1", at: at(700), state: "open" },
				],
			},
			now,
		);
		expect(parsed.issues).toEqual([expect.stringMatching(/^doorEvents\[1\]: /)]);
	});

	test("a resent interval replaces the one in", async () => {
		await ingest({ readings: [reading("Z-A", 0, 20)] });
		await ingest({ readings: [reading("Z-A", 0, 30)] });
		const rows = await db.select().from(energyReading);
		expect(rows.map((row) => row.avgKw)).toEqual([30]);
	});

	test("a zone's alert is once per hour, and grows from near to over within it", async () => {
		await ingest({ readings: [reading("Z-A", 0, 90)] });
		expect((await alerts()).map((a) => [a.key, a.severity])).toEqual([
			["zone:1:2026-10-17T10", "near"],
		]);
		await ingest({ readings: [reading("Z-A", 15, 110), reading("Z-A", 30, 130)] });
		expect((await alerts()).map((a) => [a.key, a.severity, a.measured])).toEqual([
			["zone:1:2026-10-17T10", "active", 130],
		]);
		// The next hour has an alert of its own.
		await ingest({ readings: [reading("Z-A", 60, 101)] });
		expect((await alerts()).map((a) => a.key)).toEqual([
			"zone:1:2026-10-17T10",
			"zone:1:2026-10-17T11",
		]);
	});

	test("a zone with its thresholds off raises nothing", async () => {
		expect(await ingest({ readings: [reading("Z-B", 0, 9999)] })).toMatchObject({
			stored: { alerts: 0 },
		});
	});

	test("a door's alert is once per opening; while it's open it follows the opening", async () => {
		await ingest({ doorEvents: [door(0, "open")] }, t(12));
		const [first] = await alerts();
		expect(first).toMatchObject({ metric: "door", doorId: 1, zoneId: 1, measured: 12 });
		await ingest({ doorEvents: [door(18, "closed")] }, t(20));
		const [again] = await alerts();
		expect(again).toMatchObject({ id: first.id, measured: 18 });
		// A short opening raises nothing; a long one an alert of its own.
		await ingest({ doorEvents: [door(30, "open"), door(35, "closed")] }, t(40));
		await ingest({ doorEvents: [door(50, "open"), door(70, "closed")] }, t(71));
		expect((await alerts()).map((a) => [a.at, a.measured])).toEqual([
			[t(0), 18],
			[t(50), 20],
		]);
	});

	test("a door open for days raises its alert once, with any batch", async () => {
		// Opened Friday 10:00 and not yet overdue when its event came in; the next batches come in
		// over a day later, and on Monday.
		await ingest({ doorEvents: [door(0, "open")] }, t(5));
		expect(await alerts()).toEqual([]);
		await ingest({ readings: [reading("Z-A", 30 * 60, 1)] }, t(30 * 60 + 20));
		const [alert] = await alerts();
		expect(alert).toMatchObject({ metric: "door", doorId: 1, at: t(0), measured: 30 * 60 + 20 });
		const monday = 3 * 24 * 60;
		await ingest({ readings: [reading("Z-A", monday, 1)] }, t(monday + 20));
		expect(await alerts()).toEqual([
			expect.objectContaining({ id: alert.id, at: t(0), measured: monday + 20 }),
		]);
	});

	test("a door open for days that has closed raises its alert once it's in", async () => {
		await ingest({ doorEvents: [door(0, "open")] }, t(5));
		const monday = 3 * 24 * 60;
		await ingest({ doorEvents: [door(monday, "closed")] }, t(monday + 1));
		expect(await alerts()).toEqual([
			expect.objectContaining({ metric: "door", at: t(0), measured: monday }),
		]);
	});

	test("raises nothing about breaches older than a day", async () => {
		const outcome = await ingest(
			{ readings: [reading("Z-A", 0, 500)], doorEvents: [door(0, "open"), door(30, "closed")] },
			t(25 * 60),
		);
		expect(outcome).toMatchObject({ stored: { readings: 1, doorEvents: 2, alerts: 0 } });
	});
});

describe("tenancy", () => {
	test("another tenant's site is not found", async () => {
		const parsed = parseBatch({ site: 2, readings: [reading("Z-S", 0, 1)] }, now);
		expect(await north(() => storeBatch(parsed.batch!, now))).toEqual({ notFound: true });
	});

	test("codes the site doesn't have, another tenant's included, refuse the whole batch", async () => {
		const outcome = await ingest({
			readings: [reading("Z-A", 0, 1), reading("Z-S", 0, 1)],
			doorEvents: [{ ...door(0, "open"), door: "D-9" }],
		});
		expect(outcome).toEqual({ unknown: { zones: ["Z-S"], doors: ["D-9"] } });
		expect(await db.select().from(energyReading)).toEqual([]);
	});

	test("only North's rows are stored, under North", async () => {
		await ingest({ readings: [reading("Z-A", 0, 1)] });
		const rows = await db.select().from(energyReading).where(eq(energyReading.zoneId, 1));
		expect(rows.map((row) => row.organizationId)).toEqual(["north"]);
	});
});

describe("the energy module's tokens", () => {
	const request = (token?: string) =>
		new Request("http://localhost/energy/ingest", {
			method: "POST",
			headers: token ? { authorization: `Bearer ${token}` } : {},
		});
	const statusOf = (promise: Promise<unknown>) =>
		promise.then(
			() => 200,
			(error: { status?: number }) => error.status,
		);

	test("an energy token feeds only its own tenant", async () => {
		const { token } = await north(() => issueIntegrationToken("energy", "P1 gateway"));
		expect(await integrationTenant(request(token), "energy")).toMatchObject({
			organizationId: "north",
			modules: ["energy"],
		});
	});

	test("a docks token, a revoked one or none at all is a 401", async () => {
		const { token: docks } = await north(() => issueIntegrationToken("docks", "Salvo"));
		expect(await statusOf(integrationTenant(request(docks), "energy"))).toBe(401);
		expect(await statusOf(integrationTenant(request(), "energy"))).toBe(401);
		const { token } = await north(() => issueIntegrationToken("energy", "P1 gateway"));
		const [row] = await db.$client
			.execute(`select id from integration_token where module_id = 'energy'`)
			.then((result) => result.rows);
		await north(() => revokeIntegrationToken("energy", Number(row.id)));
		expect(await statusOf(integrationTenant(request(token), "energy"))).toBe(401);
	});

	test("a tenant without the module gets a 404, whatever its token", async () => {
		const { token } = await asSystem(tenant("south"), () =>
			issueIntegrationToken("energy", "P1 gateway"),
		);
		expect(await statusOf(integrationTenant(request(token), "energy"))).toBe(404);
	});
});
