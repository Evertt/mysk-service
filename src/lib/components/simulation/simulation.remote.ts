/**
 * The simulation bar's remote functions (`#lib/server/simulation.ts`): its state, live, for the
 * office's members; the tick it sends while it's open; and play, pause, speed and reset for
 * managers. A tenant without the module, or without a simulation of it, gets a 404 from the
 * commands; the state is `null` for a tenant that has the module but no simulation of it.
 */
import { error } from "@sveltejs/kit";
import * as v from "valibot";

import { isManager } from "#lib/auth/index.ts";
import { moduleIds } from "#lib/modules/ids.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { live } from "#lib/server/live.ts";
import { forManagers, forMembers } from "#lib/server/remote-functions.ts";
import {
	changeSimulation,
	requireSimulation,
	resetSimulation,
	runSimulations,
	type SimulationRow,
	simulationOf,
} from "#lib/server/simulation.ts";
import { simulationSpeeds } from "#lib/simulation/extensions.ts";

const moduleId = v.picklist(moduleIds);

/** What the bar shows of a simulation. */
const view = (row: SimulationRow | null) =>
	row && {
		running: row.running,
		speed: row.speed,
		startedAt: row.startedAt,
		canManage: isManager(currentTenant().roles),
	};

/**
 * The current tenant's simulation of the module (`null` if it's offered none), sent again when a
 * manager plays, pauses, changes its speed or resets it. A 404 for a module the tenant lacks.
 */
export const getSimulation = forMembers.query.live(moduleId, (id) =>
	live(["simulation"], async (change) => {
		if (!change && !currentTenant().modules.includes(id)) error(404, m.common_error_not_found());
		return view(await simulationOf(id));
	}),
);

/** Moves the current tenant's running simulation of the module on, up to now. */
export const tickSimulation = forMembers.command(moduleId, async (id) => {
	await requireSimulation(id);
	const ticked = await runSimulations(undefined, {
		organizationId: currentTenant().organizationId,
		moduleId: id,
	});
	return { ticked: ticked.length > 0 };
});

/** Plays (`running`) or pauses the simulation. */
export const playSimulation = forManagers.command(
	v.object({ module: moduleId, running: v.boolean() }),
	async ({ module, running }) => {
		await changeSimulation(module, { running });
	},
);

/** Sets the simulation's speed. */
export const setSimulationSpeed = forManagers.command(
	v.object({ module: moduleId, speed: v.picklist(simulationSpeeds) }),
	async ({ module, speed }) => {
		await changeSimulation(module, { speed });
	},
);

/** Puts the module's data back in its starting states, and starts the simulation over. */
export const resetSimulationState = forManagers.command(moduleId, async (id) => {
	await resetSimulation(id);
});
