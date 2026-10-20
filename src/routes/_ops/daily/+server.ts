import { error, type RequestHandler } from "@sveltejs/kit";

import { mayRunDaily, runDaily } from "#lib/server/jobs/daily.ts";

/**
 * Starts the daily jobs (`runDaily()`), for a cron: a `POST` with a JSON body (`{}`), as SvelteKit
 * refuses a POST from elsewhere that has no content type, or a form's (CSRF). Answers what each
 * organization's jobs did.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!mayRunDaily(request)) error(403, m.common_error_no_permission());
	return Response.json({ organizations: await runDaily() });
};
