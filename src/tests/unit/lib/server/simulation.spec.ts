import { rmSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { currentTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { contribute, defineServerModule, type ServerModule } from "#lib/server/extensions.ts";
import { runSimulations, tickCap } from "#lib/server/simulation.ts";
import { simulated, simulationRun, type SimulationTick } from "#lib/simulation/extensions.ts";

// No request: the cron's run has none, and the modules tick as the system.
vi.mock("$app/server", () => ({
	getRequestEvent: () => {
		throw new Error("Asked for a request");
	},
}));
vi.mock("#lib/modules/manifests.ts", () => ({ modules: [] }));
// Made-up modules `a` and `b` instead of the ones in `src/modules`.
const registry = vi.hoisted(() => ({ modules: [] as ServerModule[] }));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => registry.modules,
}));
vi.mock("#lib/modules/ids.gen.ts", () => {
	const node = { requires: [], enhances: [], alwaysOn: false, navAfter: null };
	const ids = ["a", "b"] as const;
	return {
		generatedModuleIds: ids,
		generatedModuleGraph: Object.fromEntries(ids.map((id) => [id, node])),
	};
});

// A temporary database made by the app's migrations: North has `a` and `b` on, South only `b`;
// each has simulations of both (South's `a` can't run: the module is off there).
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "simulation-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const { migrate } = await import("drizzle-orm/libsql/migrator");
	const { drizzleQueued } = await import("#lib/server/db/serialize.ts");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
	await client.executeMultiple(`
		insert into organization (id, name, slug, created_at) values
			('north', 'North', 'north', 0), ('south', 'South', 'south', 0);
		insert into organization_module (organization_id, module_id) values
			('north', 'a'), ('north', 'b'), ('south', 'b');
	`);
	return { db: drizzleQueued(client, { schema }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

/** The specs' clock: `minutes` after 08:00 UTC on a fixed day, in whole seconds. */
const time = (minutes: number) =>
	Temporal.Instant.from("2026-10-17T08:00:00Z").add({ seconds: Math.round(minutes * 60) });
const seconds = (minutes: number) => time(minutes).epochMilliseconds / 1000;

/** What the made-up modules were asked: by whom, about which interval. */
let ticks: { module: string; organization: string; user: string; tick: SimulationTick }[] = [];

const recording = (module: string) =>
	defineServerModule(module as never, [
		contribute(
			simulationRun,
			simulated({
				tick: async (tick) => {
					const tenant = currentTenant();
					ticks.push({ module, organization: tenant.organizationId, user: tenant.user.id, tick });
				},
				reset: async () => {},
			}),
		),
	]);

/** Replaces every simulation with `rows`, each ticked last at `minutes`. */
async function simulations(rows: [string, string, boolean, number, number][]) {
	await db.$client.execute("delete from simulation");
	for (const [organization, module, running, speed, minutes] of rows) {
		await db.$client.execute({
			sql: `insert into simulation (organization_id, module_id, running, speed, last_tick_at, started_at)
				values (?, ?, ?, ?, ?, ?)`,
			args: [organization, module, running ? 1 : 0, speed, seconds(minutes), seconds(minutes)],
		});
	}
}

const lastTick = async (organization: string, module: string) =>
	Number(
		(
			await db.$client.execute({
				sql: "select last_tick_at from simulation where organization_id = ? and module_id = ?",
				args: [organization, module],
			})
		).rows[0].last_tick_at,
	);

beforeEach(() => {
	ticks = [];
	registry.modules = [recording("a"), recording("b")];
});

describe("runSimulations", () => {
	test("ticks each running simulation over the time since its last tick, as the system", async () => {
		await simulations([
			["north", "a", true, 5, 0],
			["north", "b", true, 1, 1],
		]);
		const ticked = await runSimulations(time(2));
		expect(ticked.map(({ moduleId, from, to, speed }) => [moduleId, from, to, speed])).toEqual([
			["a", time(0), time(2), 5],
			["b", time(1), time(2), 1],
		]);
		expect(ticks).toEqual([
			{ module: "a", organization: "north", user: "system", tick: expect.anything() },
			{ module: "b", organization: "north", user: "system", tick: expect.anything() },
		]);
		expect(ticks[0].tick).toMatchObject({ from: time(0), to: time(2), speed: 5 });
		expect(await lastTick("north", "a")).toBe(seconds(2));
		expect(await lastTick("north", "b")).toBe(seconds(2));
	});

	test("never ticks an interval twice: the next run goes on from where the last one ended", async () => {
		await simulations([["north", "a", true, 1, 0]]);
		await runSimulations(time(1));
		// A caller that comes later with an earlier moment, or the same one, finds nothing to do.
		expect(await runSimulations(time(1))).toEqual([]);
		expect(await runSimulations(time(0.5))).toEqual([]);
		await runSimulations(time(3));
		expect(ticks.map(({ tick }) => [tick.from, tick.to])).toEqual([
			[time(0), time(1)],
			[time(1), time(3)],
		]);
	});

	test("overlapping runs share the interval out, without ticking any of it twice", async () => {
		await simulations([["north", "a", true, 1, 0]]);
		await Promise.all([runSimulations(time(2)), runSimulations(time(2))]);
		expect(ticks.map(({ tick }) => [tick.from, tick.to])).toEqual([[time(0), time(2)]]);
	});

	test("after a pause in the ticks or an outage, ticks at most the cap", async () => {
		await simulations([["north", "a", true, 1, 0]]);
		await runSimulations(time(90));
		const cap = tickCap.total("minutes");
		expect(ticks.map(({ tick }) => [tick.from, tick.to])).toEqual([[time(90 - cap), time(90)]]);
		expect(await lastTick("north", "a")).toBe(seconds(90));
	});

	test("leaves paused simulations, and those of modules that are off, alone", async () => {
		await simulations([
			["north", "a", false, 1, 0],
			["north", "b", true, 1, 0],
			// South doesn't have `a` on.
			["south", "a", true, 1, 0],
			["south", "b", true, 1, 0],
		]);
		await runSimulations(time(1));
		expect(ticks.map(({ module, organization }) => `${organization}/${module}`)).toEqual([
			"north/b",
			"south/b",
		]);
		expect(await lastTick("north", "a")).toBe(seconds(0));
		expect(await lastTick("south", "a")).toBe(seconds(0));
	});

	test("ticks one organization's simulations (of one module) when asked to", async () => {
		await simulations([
			["north", "a", true, 1, 0],
			["north", "b", true, 1, 0],
			["south", "b", true, 1, 0],
		]);
		await runSimulations(time(1), { organizationId: "south" });
		expect(ticks.map(({ module, organization }) => `${organization}/${module}`)).toEqual([
			"south/b",
		]);
		await runSimulations(time(2), { organizationId: "north", moduleId: "b" });
		expect(ticks.map(({ module, organization }) => `${organization}/${module}`)).toEqual([
			"south/b",
			"north/b",
		]);
		// Each module ticks in its own organization only.
		expect(await lastTick("north", "a")).toBe(seconds(0));
		expect(await lastTick("south", "b")).toBe(seconds(1));
	});

	test("a simulation that fails is logged, and the others go on", async () => {
		registry.modules = [
			defineServerModule("a" as never, [
				contribute(
					simulationRun,
					simulated({
						tick: async () => {
							throw new Error("broken");
						},
						reset: async () => {},
					}),
				),
			]),
			recording("b"),
		];
		await simulations([
			["north", "a", true, 1, 0],
			["north", "b", true, 1, 0],
		]);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const ticked = await runSimulations(time(1));
		expect(ticked.map((each) => each.moduleId)).toEqual(["b"]);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});
});
