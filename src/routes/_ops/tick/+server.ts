import { error, type RequestHandler } from "@sveltejs/kit";

import { mayRunDaily } from "#lib/server/jobs/daily.ts";
import { runSimulations } from "#lib/server/simulation.ts";

/**
 * Ticks the demo's running simulations (`runSimulations()`), for a cron every 15 minutes (on
 * Cloudflare the Worker's Cron Trigger, `cloudflare/entry.ts`): authorized like `/_ops/daily`, with
 * `CRON_SECRET` or `OPS_TOKEN`. `POST` with a JSON body (`{}`), as SvelteKit refuses a POST from
 * elsewhere without a content type; `GET` for Vercel Cron. Answers what was ticked.
 */
const run: RequestHandler = async ({ request }) => {
	if (!mayRunDaily(request)) error(403, m.common_error_no_permission());
	const ticked = await runSimulations();
	return Response.json({
		ticked: ticked.map(({ organizationId, moduleId, from, to, speed }) => ({
			organizationId,
			moduleId,
			from: from.toString(),
			to: to.toString(),
			speed,
		})),
	});
};

export const GET = run;
export const POST = run;
