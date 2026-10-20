/**
 * A module's daily run of automatic orders (`jobs.daily`, see `./daily.ts`): for a tenant that has
 * them on in its settings (kept with `defineTenantSettings()`, `#lib/server/modules/settings.ts`),
 * it makes an order for each candidate (a plan that's due, a critical unit), each in a transaction
 * of its own, so one that fails is logged and the others go ahead. It notes when it ran and how
 * many orders it made in the settings (`lastRunAt`, `lastRunOrders`, which the settings page
 * shows), and reports `{ "<module>.orders": n }`, with `"<module>.failed"` if any failed.
 * Maintenance's and condition's `server/automatic.ts` use it.
 */
import type { DailyReport } from "#lib/jobs/extensions.ts";
import type { ModuleId } from "#lib/modules/ids.ts";

/** The settings a run reads and notes itself in: those of `defineTenantSettings()`. */
interface RunSettings<Settings> {
	settingsOf(): Promise<Settings>;
	updateSettings(values: { lastRunAt: Temporal.Instant; lastRunOrders: number }): Promise<void>;
}

interface OrderRun<Settings, Candidate, Made> {
	/** The module whose run it is: its report's counts are `<module>.orders` and `<module>.failed`. */
	module: ModuleId;
	settings: RunSettings<Settings>;
	/** Whether the tenant wants the run: without, it does nothing (and notes nothing). */
	enabled: (settings: Settings) => boolean;
	/** What to make orders for, in the order to make them. */
	candidates: (settings: Settings) => Promise<readonly Candidate[]>;
	/**
	 * Makes the candidate's order in a transaction of its own, checking it again there: answers
	 * what it made, or nothing when the candidate needs none any more.
	 */
	order: (candidate: Candidate, settings: Settings) => Promise<Made | null | undefined>;
	/** The candidate in the log line of a failure, e.g. `Maintenance plan 12`. */
	name: (candidate: Candidate) => string;
	/** What to do with the orders made, outside their transactions (mail the customers, say). */
	after?: (made: Made[], settings: Settings) => Promise<void>;
}

/** Runs the current tenant's automatic orders of `run.module` (see above). */
export async function dailyOrderRun<Settings, Candidate, Made>(
	run: OrderRun<Settings, Candidate, Made>,
): Promise<DailyReport> {
	const settings = await run.settings.settingsOf();
	if (!run.enabled(settings)) return {};

	const made: Made[] = [];
	let failed = 0;
	for (const candidate of await run.candidates(settings)) {
		try {
			const ordered = await run.order(candidate, settings);
			if (ordered != null) made.push(ordered);
		} catch (error) {
			failed++;
			console.error(`${run.name(candidate)} got no automatic order:`, error);
		}
	}
	await run.settings.updateSettings({
		lastRunAt: Temporal.Now.instant(),
		lastRunOrders: made.length,
	});
	await run.after?.(made, settings);
	return {
		[`${run.module}.orders`]: made.length,
		...(failed ? { [`${run.module}.failed`]: failed } : {}),
	};
}
