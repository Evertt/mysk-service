/**
 * The energy module's contributions to the core's hooks: the demo's simulation of its P1 meters
 * and door sensors, for an organization that's offered one (`simulation.run`,
 * `live-simulation.ts`), a monitored customer's site can't be deleted
 * (`customers.removingSite`, `site-removal.ts`), and the energy its doors lose is a figure of the
 * site (`customers.siteSummary`, `site-summary.ts`). The alerts its readings raise ring the office's
 * bell (`notifications.rules`, `notifications.ts`). A unit that is a monitored door has its
 * openings, alerts and today's figures in its timeline (`equipment.timeline`,
 * `equipment.figures`, `timeline.ts`).
 */
import { accessRules } from "#lib/access/extensions.ts";
import { removingSite, siteSummary } from "#lib/customers/extensions.ts";
import { figures, timeline } from "#lib/equipment/extensions.ts";
import { notificationRules } from "#lib/notifications/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { simulated, simulationRun } from "#lib/simulation/extensions.ts";

import { energyAccess } from "./access.ts";
import { energySimulation } from "./live-simulation.ts";
import { energyNotificationRules } from "./notifications.ts";
import { siteEnergyRefusal } from "./site-removal.ts";
import { energySiteSummary } from "./site-summary.ts";
import { doorFigures, doorTimeline } from "./timeline.ts";

export default defineServerModule("energy", [
	contribute(accessRules, () => energyAccess),
	contribute(simulationRun, simulated(energySimulation)),
	contribute(removingSite, siteEnergyRefusal),
	contribute(siteSummary, energySiteSummary),
	contribute(notificationRules, energyNotificationRules),
	contribute(timeline, doorTimeline),
	contribute(figures, doorFigures),
]);
