import type { RequestHandler } from "@sveltejs/kit";

import { parseBatch } from "#modules/docks/server/events.ts";
import { applyBatch, UnknownDocks } from "#modules/docks/server/ingest.ts";
import { checkDoors } from "#modules/docks/server/rules.ts";

/**
 * The Salvo event feed (`POST /docks/ingest`, see `docs/salvo-events.md`): a JSON batch of events,
 * with the tenant's integration token (its route stub checks it, `guardedIntegration()`, and runs
 * this as the system in the token's tenant). Answers what came of each event and the breakdown
 * orders the door rules made; 422 with the issues for a batch that isn't valid (nothing applied),
 * 415 for a body that isn't JSON.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!request.headers.get("content-type")?.startsWith("application/json")) {
		return Response.json({ error: "unsupported_media_type" }, { status: 415 });
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "invalid_json" }, { status: 400 });
	}
	const now = Temporal.Now.instant();
	const parsed = parseBatch(body, now);
	if ("issues" in parsed) {
		return Response.json({ error: "invalid_batch", issues: parsed.issues }, { status: 422 });
	}
	try {
		const result = await applyBatch(parsed.events, now);
		// After the batch's commit, in transactions of their own (see `rules.ts`).
		const checked = await checkDoors(Temporal.Now.instant());
		return Response.json({ ...result, orders: checked.orders });
	} catch (error) {
		if (error instanceof UnknownDocks) {
			return Response.json({ error: "unknown_docks", docks: error.codes }, { status: 422 });
		}
		throw error;
	}
};
