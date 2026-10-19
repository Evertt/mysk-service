/**
 * The energy module's contributions to the core's hooks: the demo's simulation of its P1 meters
 * and door sensors, for an organization that's offered one (`simulation.run`,
 * `live-simulation.ts`), and a monitored customer's site can't be deleted
 * (`customers.removingSite`, `site-removal.ts`). The alerts its readings raise ring the office's
 * bell (`notifications.rules`, `notifications.ts`).
 */
import { removingSite } from "#lib/customers/extensions.ts";
import { notificationRules } from "#lib/notifications/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { simulated, simulationRun } from "#lib/simulation/extensions.ts";

import { energySimulation } from "./live-simulation.ts";
import { energyNotificationRules } from "./notifications.ts";
import { siteEnergyRefusal } from "./site-removal.ts";

export default defineServerModule("energy", [
	contribute(simulationRun, simulated(energySimulation)),
	contribute(removingSite, siteEnergyRefusal),
	contribute(notificationRules, energyNotificationRules),
]);
