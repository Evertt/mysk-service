import type { RequestHandler } from "@sveltejs/kit";

import { textUpTo } from "#lib/server/modules/integrations.ts";
import { maxBodyBytes } from "#modules/docks/server/events.ts";
import { receiveBatch } from "#modules/docks/server/feed.ts";
import { UnknownDocks } from "#modules/docks/server/ingest.ts";

/**
 * The Salvo event feed (`POST /docks/ingest`, see `docs/salvo-events.md`): a JSON batch of events,
 * with the tenant's integration token (its route stub checks it, `guardedIntegration()`, and runs
 * this as the system in the token's tenant). Answers what came of each event and the breakdown
 * orders the door rules made; 422 with the issues for a batch that isn't valid (nothing applied),
 * 415 for a body that isn't JSON, 413 for one larger than a full batch takes (`maxBodyBytes`), which
 * is read no further.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!request.headers.get("content-type")?.startsWith("application/json")) {
		return Response.json({ error: "unsupported_media_type" }, { status: 415 });
	}
	const text = await textUpTo(request, maxBodyBytes);
	if (text === null) return Response.json({ error: "too_large" }, { status: 413 });
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	try {
		const received = await receiveBatch(body);
		if ("issues" in received) {
			return Response.json({ error: "invalid_batch", issues: received.issues }, { status: 422 });
		}
		return Response.json(received);
	} catch (error) {
		if (error instanceof UnknownDocks) {
			return Response.json({ error: "unknown_docks", docks: error.codes }, { status: 422 });
		}
		throw error;
	}
};
