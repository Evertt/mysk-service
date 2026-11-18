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

/** What a sweep of stored files is told: the moment the run started. */
export interface SweepRun {
	now: Temporal.Instant;
}

/**
 * The modules' sweeps of the files they keep in a store, beside the core's in the daily run
 * (`runDaily()`): each deletes the tenant's files under its own prefix that no row of its points to
 * and that were stored more than a day before `now` (`sweepFiles()`, `#lib/server/files/stored.ts`),
 * and answers its count for the report (`{ "condition.photos_swept": 2 }`). Asked of the modules the
 * tenant has switched off too: they keep their rows, and so their files, and a deletion that took a
 * unit's rows may have left the files behind. One that throws is logged and left out.
 */
export const fileSweeps = defineCollector<SweepRun, DailyReport>("jobs.fileSweeps", {
	onError: "skip",
	alsoOff: true,
});
