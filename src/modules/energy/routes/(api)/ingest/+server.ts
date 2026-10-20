import type { RequestHandler } from "@sveltejs/kit";

import { InvalidBatch, jsonIngest } from "#lib/server/modules/integrations.ts";
import { MAX_BODY_BYTES, parseBatch } from "#modules/energy/ingest/format.ts";
import { ingestSites, storeBatch } from "#modules/energy/server/ingest.ts";

/**
 * The meters' feed (`/energy/ingest`, see `docs/ingest.md`), with the tenant's integration token:
 * its route stub checks it (`guardedIntegration()`) and runs this as the system in the token's
 * tenant. `GET` answers the tenant's sites with their zones' and doors' codes; `POST` stores a batch
 * of readings and door events, all or nothing, and raises the alerts it breaches; it refuses a
 * batch that isn't valid, is for a site the tenant hasn't or names codes the site hasn't, and a body
 * `jsonIngest()` can't take.
 */
export const GET: RequestHandler = async () => Response.json({ sites: await ingestSites() });

export const POST = jsonIngest({ maxBytes: MAX_BODY_BYTES }, async (body) => {
	const now = Temporal.Now.instant();
	const parsed = parseBatch(body, now);
	if (parsed.issues) throw new InvalidBatch(parsed.issues);
	return storeBatch(parsed.batch, now);
});
