import { error, type RequestHandler } from "@sveltejs/kit";

import { mayRunDaily, runDaily } from "#lib/server/jobs/daily.ts";

/**
 * Starts the daily jobs (`runDaily()`), for a cron: `GET` for Vercel Cron, which only sends that,
 * `POST` for anything else, with a JSON body (`{}`): SvelteKit refuses a POST from elsewhere that
 * has no content type, or a form's (CSRF). Answers what each organization's jobs did.
 */
const run: RequestHandler = async ({ request }) => {
	if (!mayRunDaily(request)) error(403, m.common_error_no_permission());
	return Response.json({ organizations: await runDaily() });
};

export const GET = run;
export const POST = run;
