/**
 * The energy module's contributions to the core's hooks: the demo's simulation of its P1 meters
 * and door sensors, for an organization that's offered one (`simulation.run`,
 * `live-simulation.ts`).
 */
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { simulated, simulationRun } from "#lib/simulation/extensions.ts";

import { energySimulation } from "./live-simulation.ts";

export default defineServerModule("energy", [
	contribute(simulationRun, simulated(energySimulation)),
]);
