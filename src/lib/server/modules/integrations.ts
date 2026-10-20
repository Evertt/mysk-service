/**
 * What the modules' integration endpoints (the `+server.ts` files in a module's `(api)` routes,
 * guarded by `guardedIntegration()` in `./hooks.ts`) share in reading what a system outside the
 * app posts them. `jsonIngest()` is the one way to take a JSON batch: it owns the statuses of a
 * body it can't take, and every refusal answers one shape, `{ error, message, …details }`.
 */
import type { RequestHandler } from "@sveltejs/kit";

import { formatNumber } from "#lib/i18n/index.ts";
import type { BatchIssue } from "#lib/modules/batch-issues.ts";
import { Refused } from "#lib/server/refused.ts";

/**
 * A batch the feed refuses (nothing of it stored): the status, a code for the program that posted
 * it (`error`), a message for its people, and what more it says (`details`, e.g. the `issues`).
 * Thrown by a feed's handler, or by the service it calls, inside its transaction or not.
 */
export class IngestRefused extends Refused {
	constructor(
		readonly error: string,
		message: string,
		readonly details: Record<string, unknown> = {},
		readonly status = 422,
	) {
		super(message);
	}
}

/** A batch that isn't in the feed's format: a 422 with its `issues` (`#lib/modules/batch-issues.ts`). */
export class InvalidBatch extends IngestRefused {
	constructor(readonly issues: readonly BatchIssue[]) {
		super("invalid_batch", m.common_ingest_invalid(), { issues });
	}
}

/**
 * A batch that names codes the tenant hasn't (another tenant's included), by kind:
 * `{ docks: ["DOCK 09"] }`, `{ zones: […], doors: […] }`. A 422 with them as `unknown`.
 */
export class UnknownCodes extends IngestRefused {
	constructor(readonly unknown: Record<string, readonly string[]>) {
		super("unknown_codes", m.common_ingest_unknown_codes(), { unknown });
	}
}

/** The answer to a refused batch: `{ error, message, …details }` with its status. */
const refusal = (refused: IngestRefused) =>
	Response.json(
		{ error: refused.error, message: refused.message, ...refused.details },
		{ status: refused.status },
	);

/**
 * A feed's `POST` handler for a JSON batch of at most `maxBytes`: a 415 for a body that isn't
 * JSON by its type, a 413 for one larger (read no further, `textUpTo()`), a 400 for one that
 * doesn't parse, and what `handle` throws as an `IngestRefused` with its status (an
 * `InvalidBatch` or `UnknownCodes` is a 422). What `handle` answers is the response's JSON.
 */
export function jsonIngest(
	{ maxBytes }: { maxBytes: number },
	handle: (body: unknown) => Promise<unknown>,
): RequestHandler {
	return async ({ request }) => {
		if (!request.headers.get("content-type")?.startsWith("application/json")) {
			return refusal(new IngestRefused("unsupported_media_type", m.common_ingest_json(), {}, 415));
		}
		const text = await textUpTo(request, maxBytes);
		if (text === null) {
			const size = `${formatNumber(maxBytes / 1000)} kB`;
			return refusal(new IngestRefused("too_large", m.common_ingest_too_large({ size }), {}, 413));
		}
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			return refusal(new IngestRefused("invalid_json", m.common_ingest_json(), {}, 400));
		}
		try {
			return Response.json(await handle(body));
		} catch (thrown) {
			if (thrown instanceof IngestRefused) return refusal(thrown);
			throw thrown;
		}
	};
}

/**
 * The request's body as text, or `null` once it's more than `max` bytes: a body whose length says
 * so isn't read, and one without a length (sent in chunks) is read no further than that. Read a
 * feed's body with this rather than `request.json()`, which reads all there is before the feed
 * can check the batch's size; `jsonIngest()` does, and answers `null` with a 413.
 */
async function textUpTo(request: Request, max: number) {
	if (Number(request.headers.get("content-length") ?? 0) > max) return null;
	if (!request.body) return "";
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let size = 0;
	let text = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return text + decoder.decode();
		size += value.byteLength;
		if (size > max) {
			await reader.cancel();
			return null;
		}
		text += decoder.decode(value, { stream: true });
	}
}
