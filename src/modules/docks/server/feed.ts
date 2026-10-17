/**
 * What the Salvo feed does with a batch, wherever it comes from: the endpoint
 * (`routes/(api)/ingest/+server.ts`) and the demo's simulation (`simulation.ts`) both hand their
 * batches here, in the current tenant. Validated (`parseBatch()`), applied in one transaction
 * (`applyBatch()`), then the door rules, in transactions of their own (`checkDoors()`).
 */
import { parseBatch } from "./events.ts";
import { applyBatch } from "./ingest.ts";
import { checkDoors } from "./rules.ts";

/**
 * Receives a batch as posted (`{ events: [...] }`) at `now`: its issues if it isn't valid (nothing
 * applied), else what came of each event and the breakdown orders the rules made. Throws
 * `UnknownDocks` for a batch naming a dock the tenant lacks.
 */
export async function receiveBatch(body: unknown, now = Temporal.Now.instant()) {
	const parsed = parseBatch(body, now);
	if ("issues" in parsed) return parsed;
	const result = await applyBatch(parsed.events, now);
	const checked = await checkDoors(Temporal.Now.instant());
	return { ...result, orders: checked.orders };
}
