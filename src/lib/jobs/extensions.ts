/**
 * The app's scheduled jobs' extension points (see `#lib/extensions/define.ts`): what the modules do
 * by themselves, with no one signed in. `runDaily()` (`#lib/server/jobs/daily.ts`) asks them.
 */
import { defineCollector } from "#lib/extensions/define.ts";

/** What a daily job is told: the day it runs for, in the run's time zone. */
export interface DailyRun {
	today: Temporal.PlainDate;
}

/** What a daily job did, as counts by what, e.g. `{ "maintenance.orders": 3 }`, for the run's report. */
export type DailyReport = Record<string, number>;

/**
 * Once a day (and safe to run more often: a job must do nothing twice), for each organization, the
 * modules it has on do their daily work in it, as the system (`asSystem()`): requests to the
 * tenant's data, their transactions and the activity log work as in a member's request. A job that
 * throws is logged and left out (`skip`), so one module's failure doesn't keep the others' work
 * from being done; each job makes its changes in transactions of its own.
 */
export const daily = defineCollector<DailyRun, DailyReport>("jobs.daily", { onError: "skip" });
