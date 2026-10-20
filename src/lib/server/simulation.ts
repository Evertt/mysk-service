/**
 * The demo's simulations (`simulationRun`, `#lib/simulation/extensions.ts`): an organization with a
 * `simulation` row for a module has that module make its data up while the row runs.
 *
 * `runSimulations(now)` ticks every running simulation over the real time since its last tick,
 * `(last_tick_at, now]` up to `now`'s whole second, at most `tickCap` of it (after a pause in the
 * ticks or an outage, it moves on from `now - tickCap`): it claims the interval in a transaction
 * (sets `last_tick_at` to its end) before the module ticks, so overlapping callers never tick an
 * interval twice. It's called from:
 *
 * - `POST /_ops/tick` (a cron's, authorized like `/_ops/daily`, `src/routes/_ops/tick/+server.ts`);
 * - on Cloudflare the Worker's Cron Trigger, every 15 minutes (`scheduled()` in
 *   `cloudflare/entry.ts`), which asks nothing of the app while no simulation runs;
 * - the simulation bar (`#lib/components/simulation/`), every 15 seconds while a page with a
 *   running simulation is open, for the current tenant only, so the demo moves between the
 *   cron's minutes.
 *
 * The module ticks and resets as the system in the tenant (`asSystem()`), so its own ingest path
 * works as for a real feed. A manager's play, pause, speed and reset are logged (subject
 * `simulation`, by the module's id); the ticks aren't: they're the clock.
 */
// Its module-scope durations need Temporal as the module loads, which SvelteKit's build does (analysing
// the routes) without the hooks that install the polyfill, and Node before 26 has none of its own.
import "temporal-polyfill/global";
import { and, eq } from "drizzle-orm";

import type { ModuleId } from "#lib/modules/ids.ts";
import { modules } from "#lib/modules/manifests.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { asSystem, currentTenant, inTenant, tenantOf } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { simulation } from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";
import { orNotFound } from "#lib/server/records.ts";
import {
	defaultSimulationSpeed,
	type SimulationSpeed,
	simulationRun,
} from "#lib/simulation/extensions.ts";

/** The most real time one tick covers: more than the cron's 15 minutes, so its ticks leave no gap. */
export const tickCap = Temporal.Duration.from({ minutes: 20 });

/** A module's simulation in a tenant, as stored. */
export type SimulationRow = typeof simulation.$inferSelect;

/** What a run ticked: per simulation, the interval it covered. */
interface SimulationTicked {
	organizationId: string;
	moduleId: string;
	from: Temporal.Instant;
	to: Temporal.Instant;
	speed: number;
}

/** The request's tenant as the system (no role), for a module's simulation in a member's request. */
const asSystemHere = <T>(work: () => Promise<T>) => {
	const { user: _user, ...tenant } = currentTenant();
	return asSystem({ ...tenant, roles: [] }, work);
};

/**
 * Claims the current tenant's simulation of `moduleId` up to `now`: answers the interval to tick
 * and moves `last_tick_at` to `now`, in one transaction; nothing if it isn't running or has been
 * ticked up to `now` already.
 */
async function claimInterval(moduleId: string, now: Temporal.Instant) {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(simulation)
			.where(and(inTenant(simulation), eq(simulation.moduleId, moduleId)));
		if (!row?.running) return null;
		// Moments are stored in whole seconds, so the tick ends at one: the next starts where this
		// one ends, and what's left of the second is the next tick's.
		const to = now.round({ smallestUnit: "second", roundingMode: "floor" });
		const earliest = to.subtract(tickCap);
		const from = Temporal.Instant.compare(row.lastTickAt, earliest) < 0 ? earliest : row.lastTickAt;
		if (Temporal.Instant.compare(from, to) >= 0) return null;
		await tx
			.update(simulation)
			.set({ lastTickAt: to })
			.where(and(inTenant(simulation), eq(simulation.moduleId, moduleId)));
		return { from, to, speed: row.speed, startedAt: row.startedAt };
	});
}

/**
 * Ticks the running simulations up to `now`: every organization's, or `only` one organization's
 * (and one module's). A simulation of a module the organization doesn't have on is left alone; one
 * that fails is logged, and the others go on. Answers what was ticked.
 */
export async function runSimulations(
	now = Temporal.Now.instant(),
	only?: { organizationId: string; moduleId?: string },
): Promise<SimulationTicked[]> {
	const rows = await db
		.select({ organizationId: simulation.organizationId, moduleId: simulation.moduleId })
		.from(simulation)
		.where(
			and(
				eq(simulation.running, true),
				only ? eq(simulation.organizationId, only.organizationId) : undefined,
				only?.moduleId ? eq(simulation.moduleId, only.moduleId) : undefined,
			),
		)
		.orderBy(simulation.organizationId, simulation.moduleId);
	const ticked: SimulationTicked[] = [];
	for (const organizationId of new Set(rows.map((row) => row.organizationId))) {
		// The system has no role: it's no member, and only the simulations run as it.
		const tenant = await tenantOf(organizationId, { roles: [] });
		if (!tenant) continue;
		for (const { moduleId } of rows.filter((row) => row.organizationId === organizationId)) {
			if (!tenant.modules.includes(moduleId)) continue;
			try {
				await asSystem(tenant, async () => {
					const interval = await claimInterval(moduleId, now);
					if (!interval) return;
					await collect(simulationRun, { kind: "tick", ...interval }, [moduleId]);
					ticked.push({ organizationId, moduleId, ...interval });
				});
			} catch (failure) {
				console.error(`The simulation of ${moduleId} failed in ${organizationId}:`, failure);
			}
		}
	}
	return ticked;
}

/** The current tenant's simulation of `moduleId`, or `null` if it's offered none. */
export async function simulationOf(moduleId: string): Promise<SimulationRow | null> {
	const [row] = await db
		.select()
		.from(simulation)
		.where(and(inTenant(simulation), eq(simulation.moduleId, moduleId)));
	return row ?? null;
}

/** The current tenant's simulation of `moduleId`; a 404 if the tenant lacks it or the module. */
export async function requireSimulation(moduleId: ModuleId) {
	const row = currentTenant().modules.includes(moduleId) ? await simulationOf(moduleId) : null;
	return orNotFound(row, m.common_error_not_found());
}

/** A module's name, as the log keeps it. */
const moduleLabel = (id: string) => modules.find((each) => each.id === id)?.label ?? id;

/**
 * Plays or pauses the current tenant's simulation of `moduleId`, or sets its speed; logged.
 * Playing starts from now: the paused time isn't made up for.
 */
export async function changeSimulation(
	moduleId: ModuleId,
	change: { running?: boolean; speed?: SimulationSpeed },
) {
	const before = await requireSimulation(moduleId);
	const now = Temporal.Now.instant();
	await db.transaction(async (tx) => {
		const resumes = change.running === true && !before.running;
		await tx
			.update(simulation)
			.set({ ...change, ...(resumes ? { lastTickAt: now } : {}) })
			.where(and(inTenant(simulation), eq(simulation.moduleId, moduleId)));
		await recordActivity(tx, {
			action: "updated",
			subject: { type: "simulation", id: moduleId, label: moduleLabel(moduleId) },
			before,
			after: change,
		});
	});
	return { ...before, ...change };
}

/**
 * Resets the current tenant's simulation of `moduleId`: the module puts its data back in its
 * starting states (as the system), and the simulation starts over, running at
 * `defaultSimulationSpeed`; logged.
 */
export async function resetSimulation(moduleId: ModuleId) {
	await requireSimulation(moduleId);
	await asSystemHere(() => collect(simulationRun, { kind: "reset" }, [moduleId]));
	const now = Temporal.Now.instant();
	const restarted = {
		running: true,
		speed: defaultSimulationSpeed,
		lastTickAt: now,
		startedAt: now,
	};
	await db.transaction(async (tx) => {
		await tx
			.update(simulation)
			.set(restarted)
			.where(and(inTenant(simulation), eq(simulation.moduleId, moduleId)));
		await recordActivity(tx, {
			action: "reset",
			subject: { type: "simulation", id: moduleId, label: moduleLabel(moduleId) },
		});
	});
}
