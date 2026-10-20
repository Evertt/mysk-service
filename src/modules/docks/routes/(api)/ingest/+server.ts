import { InvalidBatch, jsonIngest } from "#lib/server/modules/integrations.ts";
import { maxBodyBytes } from "#modules/docks/server/events.ts";
import { receiveBatch } from "#modules/docks/server/feed.ts";

/**
 * The Salvo event feed (`POST /docks/ingest`, see `docs/salvo-events.md`): a JSON batch of events,
 * with the tenant's integration token (its route stub checks it, `guardedIntegration()`, and runs
 * this as the system in the token's tenant). Answers what came of each event and the breakdown
 * orders the door rules made; refuses a batch that isn't valid or names a dock the tenant hasn't
 * (nothing applied), and a body `jsonIngest()` can't take.
 */
export const POST = jsonIngest({ maxBytes: maxBodyBytes }, async (body) => {
	const received = await receiveBatch(body);
	if ("issues" in received) throw new InvalidBatch(received.issues);
	return received;
});
