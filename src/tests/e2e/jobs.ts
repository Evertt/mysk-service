/** The app under test's daily jobs, started as a cron does (see `#lib/server/jobs/daily.ts`). */
import { opsToken } from "./global-setup.ts";
import { baseURL } from "./lane.ts";

/** What the daily run did, by organization id: each organization's modules' report. */
type DailyReports = Record<string, Record<string, number>>;

/**
 * Starts the daily jobs through `POST /_ops/daily`, with the cron's token (or `token`, or none),
 * and answers its status and, if it ran, each organization's report.
 */
export async function runDailyJobs(token: string | null = opsToken) {
	const response = await fetch(new URL("/_ops/daily", baseURL), {
		method: "POST",
		// JSON, not a form: SvelteKit refuses a cross-site POST without a content type (CSRF).
		headers: {
			"content-type": "application/json",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		body: "{}",
		redirect: "manual",
	});
	if (!response.ok) return { status: response.status, reports: {} as DailyReports };
	const { organizations } = (await response.json()) as {
		organizations: { organization: { id: string }; report: Record<string, number> }[];
	};
	const reports: DailyReports = Object.fromEntries(
		organizations.map(({ organization, report }) => [organization.id, report]),
	);
	return { status: response.status, reports };
}
