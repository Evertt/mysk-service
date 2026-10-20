/**
 * Setting a site's energy monitoring up (`server/setup.ts`), against a database made by the app's
 * migrations: an energy site for a customer site (one per site, the tenant's only), its zones (codes
 * unique per site), consumers and doors (zones and units of the site only), each change logged; and
 * deleting refused while readings, door events or alerts refer to what's deleted. And a zone set up
 * without thresholds gets §2.5's defaults once a batch gives it a day of readings
 * (`server/thresholds.ts`, through `storeBatch()`).
 */
import { rmSync } from "node:fs";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { asSystem, type Tenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { activity } from "#lib/server/db/schema.ts";
import { Refused } from "#lib/server/refused.ts";
import { parseBatch } from "#modules/energy/ingest/format.ts";
import { storeBatch } from "#modules/energy/server/ingest.ts";
import {
	energyAlert,
	energyConsumer,
	energyDoor,
	energyDoorEvent,
	energyReading,
	energySite,
	energyThreshold,
	energyZone,
} from "#modules/energy/server/schema.ts";
import {
	createEnergySite,
	customerEnergy,
	deleteConsumer,
	deleteDoor,
	deleteEnergySite,
	deleteZone,
	saveConsumer,
	saveDoor,
	saveZone,
	siteChoices,
	siteSetup,
	updateEnergySite,
} from "#modules/energy/server/setup.ts";

// No request: the system makes the changes (`asSystem()`), so nothing may ask for one.
vi.mock("$app/server", () => ({
	getRequestEvent: () => {
		throw new Error("Asked for a request");
	},
}));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({ generatedServerModules: () => [] }));

// North has the module and a customer with two sites, a unit at each; South a customer with a site
// and a unit of its own.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "energy-setup-spec-"));
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
			(1, 'north', 1, 'Plant', 'Ede', 'NL'), (2, 'south', 2, 'Breda', 'Breda', 'NL'),
			(3, 'north', 1, 'Depot', 'Arnhem', 'NL');
		insert into equipment_category (id, organization_id, name, specialty, position) values
			(1, 'north', 'Door', 'mechanical', 0), (2, 'south', 'Door', 'mechanical', 0);
		insert into equipment (id, organization_id, serial_number, name, model, manufacturer,
			category_id, status, customer_id, site_id, installed_at, warranty_until)
		values
			(10, 'north', 'N-10', 'Dock door', 'X', 'Y', 1, 'operational', 1, 1, '2020-01-01', '2022-01-01'),
			(11, 'north', 'N-11', 'Depot door', 'X', 'Y', 1, 'operational', 1, 3, '2020-01-01', '2022-01-01'),
			(20, 'south', 'S-20', 'Their door', 'X', 'Y', 2, 'operational', 2, 2, '2020-01-01', '2022-01-01');
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
/** What North's `work` was refused with (its problems), or `[]` when it was done. */
const answered = (work: () => Promise<unknown>) =>
	north(work).then(
		() => [],
		(error: unknown) => {
			if (error instanceof Refused) return error.problems;
			throw error;
		},
	);

const contract = {
	contractedPeakKw: 320,
	contractedKwhPerYear: 1_000_000,
	pvCapacityKw: 0,
	tariff: 0.28,
	co2Factor: 0.375,
	timeZone: "Europe/Amsterdam",
};
const zone = { zoneId: null, code: "Z-A", name: "Hall A", floor: "Ground", areaM2: 400 };
const door = {
	doorId: null,
	code: "D-1",
	name: "Dock 1",
	kind: "sectional" as const,
	lossKw: 11.4,
	thresholdMinutes: 10,
	insideC: 18,
	outsideC: undefined,
	equipmentId: null,
};

/** A 404 from `error()`, as a promise's rejection. */
const notFound = { status: 404 };

/** North's new energy site for its customer site 1, with a zone Z-A: its id and the zone's. */
async function plant() {
	const created = await north(() =>
		createEnergySite({ siteId: 1, name: null, meterName: null, ...contract }),
	);
	if (!("id" in created)) throw new Error("Not created");
	await north(() => saveZone(created.id, zone));
	const [row] = await db.select().from(energyZone).where(eq(energyZone.energySiteId, created.id));
	return { siteId: created.id, zoneId: row.id };
}

const entries = () =>
	db
		.select({ action: activity.action, type: activity.subjectType, label: activity.subjectLabel })
		.from(activity)
		.orderBy(activity.id);

beforeEach(async () => {
	for (const table of [energyAlert, energyDoorEvent, energyReading, energySite]) {
		await db.delete(table);
	}
	// The core's tables in SQL: a module writes only its own through drizzle (boundaries.spec.ts).
	await db.$client.executeMultiple(`delete from activity;`);
});

describe("an energy site", () => {
	test("is added for a customer site, named after it, and logged", async () => {
		const { siteId } = await plant();
		const [site] = await db.select().from(energySite).where(eq(energySite.id, siteId));
		expect(site).toMatchObject({
			organizationId: "north",
			siteId: 1,
			name: "Acme — Plant",
			meterName: "Main connection",
			contractedPeakKw: 320,
			timeZone: "Europe/Amsterdam",
		});
		expect(await entries()).toEqual([
			{ action: "created", type: "energy_site", label: "Acme — Plant" },
			{ action: "created", type: "energy_zone", label: "Z-A" },
		]);
		// The customer's card, and the sites still to choose from.
		const energy = await north(() => customerEnergy("C-1"));
		expect(energy.sites.map((each) => [each.name, each.energy?.zones ?? null])).toEqual([
			["Depot", null],
			["Plant", 1],
		]);
		expect((await north(() => siteChoices())).map((each) => each.id)).toEqual([3]);
	});

	test("is one per customer site", async () => {
		await plant();
		expect(
			await answered(() =>
				createEnergySite({ siteId: 1, name: "Again", meterName: null, ...contract }),
			),
		).toEqual([{ path: ["siteId"], message: "This site's energy is monitored already" }]);
	});

	test("is only for the tenant's own sites, and only its own are found", async () => {
		await expect(
			north(() => createEnergySite({ siteId: 2, name: null, meterName: null, ...contract })),
		).rejects.toMatchObject(notFound);
		const created = await asSystem(tenant("south"), () =>
			createEnergySite({ siteId: 2, name: null, meterName: null, ...contract }),
		);
		const theirs = "id" in created ? created.id : 0;
		await expect(north(() => siteSetup(theirs))).rejects.toMatchObject(notFound);
		await expect(
			north(() => updateEnergySite(theirs, { ...contract, name: "Stolen", meterName: "M" })),
		).rejects.toMatchObject(notFound);
		await expect(north(() => saveZone(theirs, zone))).rejects.toMatchObject(notFound);
		await expect(north(() => deleteEnergySite(theirs))).rejects.toMatchObject(notFound);
		expect(await db.select().from(energySite).where(eq(energySite.id, theirs))).toHaveLength(1);
	});

	test("its settings are saved and logged with what changed", async () => {
		const { siteId } = await plant();
		await north(() =>
			updateEnergySite(siteId, { ...contract, name: "Acme Ede", meterName: "Main", tariff: 0.31 }),
		);
		const [site] = await db.select().from(energySite).where(eq(energySite.id, siteId));
		expect(site).toMatchObject({ name: "Acme Ede", meterName: "Main", tariff: 0.31 });
		const [entry] = await db
			.select({ changes: activity.changes })
			.from(activity)
			.where(eq(activity.action, "updated"));
		expect(entry.changes).toEqual({
			name: ["Acme — Plant", "Acme Ede"],
			meterName: ["Main connection", "Main"],
			tariff: [0.28, 0.31],
		});
	});
});

describe("zones, consumers and doors", () => {
	test("a zone's code is unique in its site; a new zone comes last, without thresholds", async () => {
		const { siteId, zoneId } = await plant();
		expect(await answered(() => saveZone(siteId, { ...zone, name: "Again" }))).toEqual([
			{ path: ["code"], message: "Another zone of this site has this code" },
		]);
		// Its own code is fine when it's edited.
		expect(await answered(() => saveZone(siteId, { ...zone, zoneId, name: "Hall A1" }))).toEqual(
			[],
		);
		await north(() => saveZone(siteId, { ...zone, code: "Z-B", name: "Hall B" }));
		const zones = await db
			.select({ code: energyZone.code, name: energyZone.name, position: energyZone.position })
			.from(energyZone)
			.orderBy(energyZone.position);
		expect(zones).toEqual([
			{ code: "Z-A", name: "Hall A1", position: 0 },
			{ code: "Z-B", name: "Hall B", position: 1 },
		]);
		expect(await db.select().from(energyThreshold)).toEqual([]);
	});

	test("a consumer and a door are in the site's zones, and units of the site only", async () => {
		const { siteId, zoneId } = await plant();
		expect(
			await answered(() =>
				saveConsumer(siteId, {
					consumerId: null,
					zoneId,
					name: "Compressor",
					ratedKw: 24.6,
					equipmentId: 10,
				}),
			),
		).toEqual([]);
		// A unit at the customer's other site, or another tenant's, isn't the site's.
		for (const equipmentId of [11, 20]) {
			expect(
				await answered(() =>
					saveConsumer(siteId, { consumerId: null, zoneId, name: "X", ratedKw: 1, equipmentId }),
				),
			).toEqual([{ path: ["equipmentId"], message: "Choose one of this site's units" }]);
			expect(await answered(() => saveDoor(siteId, { ...door, zoneId, equipmentId }))).toEqual([
				{ path: ["equipmentId"], message: "Choose one of this site's units" },
			]);
		}
		// A zone of another site.
		const other = await north(() =>
			createEnergySite({ siteId: 3, name: null, meterName: null, ...contract }),
		);
		const otherId = "id" in other ? other.id : 0;
		await north(() => saveZone(otherId, { ...zone, code: "Z-D" }));
		const [otherZone] = await db.select().from(energyZone).where(eq(energyZone.code, "Z-D"));
		expect(await answered(() => saveDoor(siteId, { ...door, zoneId: otherZone.id }))).toEqual([
			{ path: ["zoneId"], message: "Choose one of this site's zones" },
		]);

		expect(await answered(() => saveDoor(siteId, { ...door, zoneId, equipmentId: 10 }))).toEqual(
			[],
		);
		expect(await answered(() => saveDoor(siteId, { ...door, zoneId, name: "Again" }))).toEqual([
			{ path: ["code"], message: "Another door of this site has this code" },
		]);
		const [saved] = await db.select().from(energyDoor);
		expect(saved).toMatchObject({
			energySiteId: siteId,
			zoneId,
			code: "D-1",
			equipmentId: 10,
			equipmentOrganizationId: "north",
		});
		const [consumer] = await db.select().from(energyConsumer);
		expect(consumer).toMatchObject({ zoneId, ratedKw: 24.6, equipmentId: 10 });
		const setup = await north(() => siteSetup(siteId));
		expect(setup.units.map((unit) => unit.id)).toEqual([10]);
		expect(setup.site).toMatchObject({ customerName: "Acme", siteName: "Plant" });
		expect(setup.doors.map((each) => each.code)).toEqual(["D-1"]);
	});

	test("a consumer or door is edited only through its own site", async () => {
		const { siteId, zoneId } = await plant();
		await north(() => saveDoor(siteId, { ...door, zoneId }));
		const [saved] = await db.select().from(energyDoor);
		const other = await north(() =>
			createEnergySite({ siteId: 3, name: null, meterName: null, ...contract }),
		);
		const otherId = "id" in other ? other.id : 0;
		await expect(
			north(() => saveDoor(otherId, { ...door, doorId: saved.id, zoneId })),
		).rejects.toMatchObject(notFound);
		await expect(north(() => deleteDoor(otherId, saved.id))).rejects.toMatchObject(notFound);
		await expect(north(() => deleteZone(otherId, zoneId))).rejects.toMatchObject(notFound);
		await expect(north(() => deleteConsumer(otherId, 999))).rejects.toMatchObject(notFound);
	});
});

describe("deleting", () => {
	test("goes, with the parts, while nothing was measured", async () => {
		const { siteId, zoneId } = await plant();
		await north(() =>
			saveConsumer(siteId, {
				consumerId: null,
				zoneId,
				name: "Fan",
				ratedKw: 2,
				equipmentId: null,
			}),
		);
		const [consumer] = await db.select().from(energyConsumer);
		await north(() => deleteConsumer(siteId, consumer.id));
		await north(() => saveDoor(siteId, { ...door, zoneId }));
		const [saved] = await db.select().from(energyDoor);
		expect(await answered(() => deleteDoor(siteId, saved.id))).toEqual([]);
		expect(await answered(() => deleteZone(siteId, zoneId))).toEqual([]);
		expect(await answered(() => deleteEnergySite(siteId))).toEqual([]);
		expect(await db.select().from(energySite)).toEqual([]);
		expect((await entries()).filter((entry) => entry.action === "deleted")).toEqual([
			{ action: "deleted", type: "energy_consumer", label: "Fan" },
			{ action: "deleted", type: "energy_door", label: "D-1" },
			{ action: "deleted", type: "energy_zone", label: "Z-A" },
			{ action: "deleted", type: "energy_site", label: "Acme — Plant" },
		]);
	});

	test("is refused while readings, door events or alerts refer to it", async () => {
		const { siteId, zoneId } = await plant();
		await north(() => saveDoor(siteId, { ...door, zoneId }));
		const [saved] = await db.select().from(energyDoor);
		const at = Temporal.Instant.from("2026-10-17T08:00:00Z");
		await db
			.insert(energyDoorEvent)
			.values({ organizationId: "north", doorId: saved.id, at, open: true });
		const doorRefused = [{ message: expect.stringContaining("The door has events or alerts") }];
		const zoneRefused = [{ message: expect.stringContaining("The zone has readings or alerts") }];
		const siteRefused = [{ message: expect.stringContaining("The site has readings") }];
		expect(await answered(() => deleteDoor(siteId, saved.id))).toEqual(doorRefused);
		expect(await answered(() => deleteZone(siteId, zoneId))).toEqual(zoneRefused);
		expect(await answered(() => deleteEnergySite(siteId))).toEqual(siteRefused);

		await db.delete(energyDoorEvent);
		await db.insert(energyReading).values({
			organizationId: "north",
			zoneId,
			start: at,
			avgKw: 4,
			peakKw: 5,
			kwh: 1,
		});
		expect(await answered(() => deleteZone(siteId, zoneId))).toEqual(zoneRefused);
		expect(await answered(() => deleteEnergySite(siteId))).toEqual(siteRefused);
		// The door has no measurements of its own.
		expect(await answered(() => deleteDoor(siteId, saved.id))).toEqual([]);

		await db.delete(energyReading);
		await db.insert(energyAlert).values({
			organizationId: "north",
			energySiteId: siteId,
			zoneId,
			key: "zone:test",
			metric: "power",
			severity: "active",
			threshold: 1,
			measured: 2,
			at,
		});
		expect(await answered(() => deleteZone(siteId, zoneId))).toEqual(zoneRefused);
		expect(await answered(() => deleteEnergySite(siteId))).toEqual(siteRefused);
		expect(await db.select().from(energyZone).where(eq(energyZone.id, zoneId))).toHaveLength(1);
		expect(
			(await entries()).some((entry) => entry.action === "deleted" && entry.type !== "energy_door"),
		).toBe(false);
	});

	test("is refused when a batch is stored just before the deleting transaction", async () => {
		const { siteId, zoneId } = await plant();
		await north(() => saveDoor(siteId, { ...door, zoneId }));
		const [saved] = await db.select().from(energyDoor);
		const at = Temporal.Instant.from("2026-10-17T08:00:00Z");
		const reading = { organizationId: "north", zoneId, start: at, avgKw: 4, peakKw: 5, kwh: 1 };
		const event = { organizationId: "north", doorId: saved.id, at, open: true };
		// Stores `measure` in a transaction of its own that takes its turn right before the next one,
		// as a batch the gateway sent meanwhile would.
		const storedFirst = (measure: (tx: Transaction) => Promise<unknown>) => {
			const transaction = db.transaction.bind(db);
			vi.spyOn(db, "transaction").mockImplementationOnce(async (work) => {
				await transaction(measure);
				return transaction(work);
			});
		};

		storedFirst((tx) => tx.insert(energyDoorEvent).values(event));
		expect(await answered(() => deleteDoor(siteId, saved.id))).toEqual([
			{ message: expect.stringContaining("The door has events or alerts") },
		]);
		await db.delete(energyDoorEvent);
		storedFirst((tx) => tx.insert(energyReading).values(reading));
		expect(await answered(() => deleteZone(siteId, zoneId))).toEqual([
			{ message: expect.stringContaining("The zone has readings or alerts") },
		]);
		await db.delete(energyReading);
		storedFirst((tx) => tx.insert(energyReading).values(reading));
		expect(await answered(() => deleteEnergySite(siteId))).toEqual([
			{ message: expect.stringContaining("The site has readings") },
		]);
		expect(await db.select().from(energyReading)).toHaveLength(1);
		expect((await entries()).some((entry) => entry.action === "deleted")).toBe(false);
	});
});

describe("a new zone's thresholds", () => {
	/** The start of the `n`th interval from 08:00 UTC on a fixed day. */
	const quarter = (n: number) =>
		Temporal.Instant.from("2026-10-16T08:00:00Z").add({ minutes: 15 * n });
	const now = quarter(200);
	const reading = (n: number, avgKw: number) => ({
		zone: "Z-A",
		start: quarter(n).toString(),
		avgKw,
		peakKw: avgKw,
		kwh: avgKw / 4,
	});
	async function ingest(siteId: number, readings: ReturnType<typeof reading>[]) {
		const parsed = parseBatch({ site: siteId, readings }, now);
		if (parsed.issues) throw new Error(JSON.stringify(parsed.issues));
		return north(() => storeBatch(parsed.batch, now));
	}

	test("are none until it has a day of readings, then §2.5's from that day, logged", async () => {
		const { siteId, zoneId } = await plant();
		// A day less a quarter: not yet.
		await ingest(
			siteId,
			Array.from({ length: 95 }, (_, n) => reading(n, 40)),
		);
		expect(await db.select().from(energyThreshold)).toEqual([]);
		// The day's last quarter, at a peak of 100 kW: 95 × 10 kWh + 25 kWh that day.
		await ingest(siteId, [reading(95, 100)]);
		const [threshold] = await db.select().from(energyThreshold);
		expect(threshold).toMatchObject({
			zoneId,
			enabled: true,
			maxKw: 130, // round(100 × 1.3)
			maxKwh: Math.round((95 * 10 + 25) * 1.3),
		});
		const [entry] = await db
			.select({ type: activity.subjectType, label: activity.subjectLabel, userId: activity.userId })
			.from(activity)
			.where(eq(activity.subjectType, "energy_threshold"));
		expect(entry).toEqual({ type: "energy_threshold", label: "Z-A", userId: null });
	});

	test("that a manager set (or switched off) are never replaced", async () => {
		const { siteId, zoneId } = await plant();
		await db
			.insert(energyThreshold)
			.values({ zoneId, organizationId: "north", enabled: false, maxKw: 1, maxKwh: 1 });
		await ingest(
			siteId,
			Array.from({ length: 100 }, (_, n) => reading(n, 40)),
		);
		expect(await db.select().from(energyThreshold)).toEqual([
			{ zoneId, organizationId: "north", enabled: false, maxKw: 1, maxKwh: 1 },
		]);
	});
});
