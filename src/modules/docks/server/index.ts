/**
 * The docks module's contributions to the core's hooks: the daily job runs the door rules and
 * prunes the feed's old events (`jobs.daily`).
 */
import { daily } from "#lib/jobs/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";

import { runDocksDaily } from "./daily.ts";

export default defineServerModule("docks", [contribute(daily, runDocksDaily)]);
