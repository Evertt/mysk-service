/**
 * The maintenance module's contributions to the core's hooks (see `#lib/server/extensions.ts`):
 * its daily job, which turns the plans that are due into orders for the tenants that want it
 * (`jobs.daily`, `automatic.ts`).
 */
import { daily } from "#lib/jobs/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";

import { runDueMaintenance } from "./automatic.ts";

export default defineServerModule("maintenance", [contribute(daily, runDueMaintenance)]);
