import { accessRules } from "#lib/access/extensions.ts";
/**
 * The maintenance module's contributions to the core's hooks (see `#lib/server/extensions.ts`):
 * its daily job, which turns the plans that are due into orders for the tenants that want it
 * (`jobs.daily`, `automatic.ts`); and, with the condition module on, a unit's next visit
 * (`condition.signals`).
 */
import { daily } from "#lib/jobs/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";
import { unitSignals } from "#modules/condition/api/extensions.ts";

import { maintenanceAccess } from "./access.ts";
import { runDueMaintenance } from "./automatic.ts";
import { nextDueSignal } from "./next-due-sql.ts";

export default defineServerModule("maintenance", [
	contribute(accessRules, () => maintenanceAccess),
	contribute(daily, runDueMaintenance),
	contribute(unitSignals, nextDueSignal),
]);
