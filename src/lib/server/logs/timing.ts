/**
 * Where the server's time goes, with `TIMING_LOGS=1` (on in staging, `wrangler.jsonc`): one
 * `type: "timing"` log line per request (`handleTiming`, first in `hooks.server.ts`'s `handle`),
 * with its route, the remote function it calls, its wall time (`ms`), the database transactions it
 * ran (how many, and their total time: on Cloudflare each holds every other request of the
 * Durable Object until it's done) and its statements (`queries`), counted in `counts.ts`; and one
 * per live query when its stream closes, with how long it was open (`live: true`, from `live()` in
 * `#lib/server/live.ts`). See "Reading the logs" in README.md.
 *
 * On Cloudflare a Worker's clocks only move at I/O (a Spectre mitigation), and the object's SQLite
 * answers synchronously: a duration there is the time between I/O, a lower bound. The counts are
 * exact.
 */
import { TIMING_LOGS } from "$app/env/private";
import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";

import { countRequest } from "./counts.ts";
import { logLine, requestFields } from "./log.ts";

const round = (ms: number) => Math.round(ms * 10) / 10;

/** Logs each request's timing line, if `TIMING_LOGS` is on. */
export const handleTiming: Handle = async ({ event, resolve }) => {
	if (!TIMING_LOGS) return resolve(event);
	const start = performance.now();
	const { counted, result } = countRequest(() => resolve(event));
	let status = 500;
	try {
		const response = await result;
		status = response.status;
		return response;
	} finally {
		logLine({
			type: "timing",
			...requestFields(event),
			method: event.request.method,
			status,
			ms: round(performance.now() - start),
			transactions: { count: counted.transactions, ms: round(counted.transactionMs) },
			queries: counted.queries,
		});
	}
};

/**
 * Starts timing a live query's stream (`query.live`) in `event`'s request; the function it returns
 * logs how long the stream was open, once it closes. Nothing without `TIMING_LOGS`.
 */
export function timeLiveStream(event: RequestEvent): () => void {
	if (!TIMING_LOGS) return () => {};
	const start = performance.now();
	const fields = requestFields(event);
	return () =>
		logLine({ type: "timing", live: true, ...fields, ms: round(performance.now() - start) });
}
