/**
 * Simulations for demos (see `#lib/server/simulation.ts`): a module whose real data comes from
 * outside (the docks' Salvo feed, energy's P1 readings) can make it up instead, for an organization
 * that has a row in `simulation` for it (the demo's SHLTR; real tenants never have one). The
 * runner asks the module, as the system in the tenant (`asSystem()`), to move its data on over
 * each interval of real time while the simulation runs, and to put it back in its starting states
 * when a manager resets it.
 *
 * A module contributes in its `server/index.ts`:
 * `contribute(simulationRun, simulated({ tick, reset }))`.
 */
import { defineCollector } from "#lib/extensions/define.ts";

/** The speeds the simulation bar offers: how much more happens per interval of real time. */
export const simulationSpeeds = [1, 2, 5, 10, 30] as const;
export type SimulationSpeed = (typeof simulationSpeeds)[number];

/**
 * What a tick is told: the interval of real time it covers, `(from, to]`, the speed, and when the
 * simulation last started from its starting states (the seed, or a reset).
 */
export interface SimulationTick {
	from: Temporal.Instant;
	to: Temporal.Instant;
	/** One of `simulationSpeeds`: at 5, five times as much happens in the interval as at 1. */
	speed: number;
	/**
	 * When it was (re)started: what the starting states show (a truck that "arrived" before it)
	 * goes on from here, so they stay on the screen a while after a reset.
	 */
	startedAt: Temporal.Instant;
}

/**
 * A module's simulation. `tick` moves its data on over the interval (the app's clock stays the
 * real one: what it makes happen, it makes happen between `from` and `to`, so timers and readings
 * show real moments), through the module's own ingest path, as a real feed would; `reset` puts its
 * data back in the starting states the demo shows. Both run as the system in the tenant.
 */
export interface Simulation {
	tick(context: SimulationTick): Promise<void>;
	reset(): Promise<void>;
}

/** What the runner asks a module's simulation to do. */
type SimulationStep = ({ kind: "tick" } & SimulationTick) | { kind: "reset" };

/**
 * The simulations of the modules: the runner asks one module at a time (`collect()` with that
 * module alone). A simulation that throws fails the step, which the runner logs.
 */
export const simulationRun = defineCollector<SimulationStep, void>("simulation.run", {
	onError: "fail",
});

/** A module's answer to `simulationRun`, from its `tick` and `reset`. */
export const simulated =
	(simulation: Simulation) =>
	(step: SimulationStep): Promise<void> =>
		step.kind === "tick" ? simulation.tick(step) : simulation.reset();
