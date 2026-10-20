/**
 * The simulation bar's remote functions (`simulation.remote.ts`) on the seeded demo database, for
 * SHLTR's docks and P1 meters (paused, as the harness seeds them): its state for the office's
 * members (who may manage it), a manager's play, speed and reset (logged), a planner refused
 * those, and a 404 for a tenant without the module or without a simulation of it. What a tick and
 * a reset do to the module's data is `src/tests/unit/lib/server/simulation.spec.ts`'s and the
 * modules' own. The server side of `docks.simulation.test.ts` and `energy.simulation.test.ts`,
 * which keep the bar.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	getSimulation,
	playSimulation,
	resetSimulationState,
	setSimulationSpeed,
	tickSimulation,
} from "#lib/components/simulation/simulation.remote.ts";
import {
	as,
	call,
	data,
	north,
	organizationId,
	rows,
	shltr,
	south,
	value,
} from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");
const modules = ["docks", "energy"] as const;
type Simulated = (typeof modules)[number];

/** SHLTR's simulation of a module as stored. */
const simulation = async (module: Simulated) =>
	(
		await rows<{ running: number; speed: number; last_tick_at: number; started_at: number }>(
			`select running, speed, last_tick_at, started_at from simulation
			 where organization_id = ? and module_id = ?`,
			[shltrId, module],
		)
	)[0];

/** SHLTR's log of a module's simulation, oldest first. */
const logOf = (module: Simulated) =>
	rows<{ action: string; user: string }>(
		`select a.action, u.email as user from activity a join user u on u.id = a.user_id
		 where a.organization_id = ? and a.subject_type = 'simulation' and a.subject_id = ? order by a.id`,
		[shltrId, module],
	);

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe.each(modules)("SHLTR's %s simulation", (module) => {
	test("shows its state to the office's members", async () => {
		const stored = await simulation(module);
		expect(stored.running).toBe(0);
		expect(await as(shltr.member, () => data(getSimulation, module))).toMatchObject({
			running: false,
			speed: stored.speed,
		});
	});

	test("refuses a planner, who's no manager, its controls; a tick is anyone's", async () => {
		const before = await simulation(module);
		await as(shltr.member, async () => {
			expect(await call(playSimulation, { module, running: true })).toMatchObject({
				status: 403,
			});
			expect(await call(setSimulationSpeed, { module, speed: 5 })).toMatchObject({ status: 403 });
			expect(await call(resetSimulationState, module)).toMatchObject({ status: 403 });
			// Paused, a tick moves nothing on.
			expect(await call(tickSimulation, module)).toMatchObject({
				status: 200,
				data: { ticked: false },
			});
		});
		expect(await simulation(module)).toEqual(before);
		expect(await logOf(module)).toEqual([]);
	});

	test("is a 404 for a tenant without the module, which can't drive SHLTR's", async () => {
		const before = await simulation(module);
		for (const actor of [north.owner, south.owner]) {
			await as(actor, async () => {
				expect(await call(getSimulation, module)).toMatchObject({ status: 404 });
				expect(await call(playSimulation, { module, running: true })).toMatchObject({
					status: 404,
				});
				expect(await call(resetSimulationState, module)).toMatchObject({ status: 404 });
				expect(await call(tickSimulation, module)).toMatchObject({ status: 404 });
			});
		}
		expect(await simulation(module)).toEqual(before);
	});

	test("a manager plays it from now, sets its speed and pauses it; logged", async () => {
		await as(shltr.owner, async () => {
			expect(await call(playSimulation, { module, running: true })).toMatchObject({ status: 200 });
			expect(await call(setSimulationSpeed, { module, speed: 5 })).toMatchObject({ status: 200 });
		});
		const playing = await simulation(module);
		expect(playing).toMatchObject({ running: 1, speed: 5 });
		// The paused time isn't made up for.
		expect(playing.last_tick_at).toBeGreaterThan(nowSeconds() - 60);
		await as(shltr.owner, () => call(playSimulation, { module, running: false }));
		expect((await simulation(module)).running).toBe(0);
		expect(await logOf(module)).toEqual(
			Array.from({ length: 3 }, () => ({ action: "updated", user: shltr.owner.email })),
		);
	});

	test("offered none, the tenant has no state, and its commands are a 404", async () => {
		const [row] = await rows<Record<string, number | string>>(
			`delete from simulation where organization_id = ? and module_id = ? returning *`,
			[shltrId, module],
		);
		try {
			await as(shltr.owner, async () => {
				expect(await call(getSimulation, module)).toEqual({ status: 200, data: null });
				expect(await call(playSimulation, { module, running: true })).toMatchObject({
					status: 404,
				});
				expect(await call(setSimulationSpeed, { module, speed: 30 })).toMatchObject({
					status: 404,
				});
				expect(await call(resetSimulationState, module)).toMatchObject({ status: 404 });
				expect(await call(tickSimulation, module)).toMatchObject({ status: 404 });
			});
		} finally {
			await value(
				`insert into simulation (organization_id, module_id, running, speed, last_tick_at, started_at)
				 values (?, ?, ?, ?, ?, ?)`,
				[
					row.organization_id,
					row.module_id,
					row.running,
					row.speed,
					row.last_tick_at,
					row.started_at,
				],
			);
		}
	});
});

describe("a reset of the docks' simulation", () => {
	test("starts it over at 30×, running; logged", async () => {
		const before = await simulation("docks");
		await as(shltr.owner, async () => {
			await call(setSimulationSpeed, { module: "docks", speed: 5 });
			expect(await call(resetSimulationState, "docks")).toMatchObject({ status: 200 });
		});
		const after = await simulation("docks");
		expect(after).toMatchObject({ running: 1, speed: 30 });
		expect(after.started_at).toBeGreaterThanOrEqual(before.started_at);
		expect(after.started_at).toBeGreaterThan(nowSeconds() - 60);
		expect((await logOf("docks")).at(-1)).toEqual({ action: "reset", user: shltr.owner.email });
		await as(shltr.owner, () => call(playSimulation, { module: "docks", running: false }));
	});
});
