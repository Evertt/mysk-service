/**
 * The condition module's contributions to the core's hooks (see `#lib/server/extensions.ts`): its
 * daily job, which plans the critical units for the tenants that want it (`jobs.daily`,
 * `automatic.ts`).
 */
import { daily } from "#lib/jobs/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";

import { planCriticalUnits } from "./automatic.ts";

export default defineServerModule("condition", [contribute(daily, planCriticalUnits)]);
