import type { RequestHandler } from "@sveltejs/kit";

import { requireModule } from "#lib/server/session.ts";

/** An endpoint: a layout's guard doesn't cover it, so it checks the module itself. */
export const GET: RequestHandler = ({ params }) => {
	requireModule("sample");
	return new Response(`sample ${params.id}`, { headers: { "content-type": "text/plain" } });
};
