import { accessRules } from "#lib/access/extensions.ts";
/**
 * The docks module's contributions to the core's hooks: the daily job runs the door rules and
 * prunes the feed's old events (`jobs.daily`), the demo's simulation drives the Salvo docks
 * through the feed (`simulation.run`, `simulation.ts`), and a customer's site with docks can't be
 * deleted (`customers.removingSite`, `site-removal.ts`). Its door alerts ring the office's bell
 * (`notifications.rules`, `notifications.ts`).
 */
import { removingSite } from "#lib/customers/extensions.ts";
import { daily } from "#lib/jobs/extensions.ts";
import { notificationRules } from "#lib/notifications/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { simulated, simulationRun } from "#lib/simulation/extensions.ts";

import { dockAccess } from "./access.ts";
import { runDocksDaily } from "./daily.ts";
import { dockNotificationRules } from "./notifications.ts";
import { docksSimulation } from "./simulation.ts";
import { siteDocksRefusal } from "./site-removal.ts";

export default defineServerModule("docks", [
	contribute(accessRules, () => dockAccess),
	contribute(daily, runDocksDaily),
	contribute(notificationRules, dockNotificationRules),
	contribute(simulationRun, simulated(docksSimulation)),
	contribute(removingSite, siteDocksRefusal),
]);
