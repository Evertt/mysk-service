import type { RequestHandler } from "@sveltejs/kit";

import { MAX_BODY_BYTES, parseBatch } from "#modules/energy/ingest/format.ts";
import { ingestSites, storeBatch } from "#modules/energy/server/ingest.ts";

/**
 * The meters' feed (`/energy/ingest`, see `docs/ingest.md`), with the tenant's integration token:
 * its route stub checks it (`guardedIntegration()`) and runs this as the system in the token's
 * tenant. `GET` answers the tenant's sites with their zones' and doors' codes; `POST` stores a batch
 * of readings and door events, all or nothing, and raises the alerts it breaches.
 */
/**
 * The request's body as text, or `null` once it's more than `max` bytes: a body without a length
 * (sent in chunks) is read no further than that.
 */
async function textUpTo(request: Request, max: number) {
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

export const GET: RequestHandler = async () => Response.json({ sites: await ingestSites() });

export const POST: RequestHandler = async ({ request }) => {
	if (!request.headers.get("content-type")?.startsWith("application/json")) {
		return Response.json(
			{ error: "unsupported_media_type", message: m.energy_ingest_json() },
			{ status: 415 },
		);
	}
	const length = Number(request.headers.get("content-length") ?? 0);
	const text = length > MAX_BODY_BYTES ? null : await textUpTo(request, MAX_BODY_BYTES);
	if (text === null) {
		return Response.json(
			{ error: "too_large", message: m.energy_ingest_too_large() },
			{ status: 413 },
		);
	}
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return Response.json(
			{ error: "invalid_json", message: m.energy_ingest_json() },
			{ status: 400 },
		);
	}
	const now = Temporal.Now.instant();
	const parsed = parseBatch(body, now);
	if (parsed.issues) {
		return Response.json(
			{ error: "invalid_batch", message: m.energy_ingest_invalid(), issues: parsed.issues },
			{ status: 422 },
		);
	}
	const outcome = await storeBatch(parsed.batch, now);
	if ("notFound" in outcome) {
		return Response.json(
			{ error: "unknown_site", message: m.energy_site_not_found() },
			{ status: 404 },
		);
	}
	if ("unknown" in outcome) {
		return Response.json(
			{
				error: "unknown_codes",
				message: m.energy_ingest_unknown_codes(),
				unknown: outcome.unknown,
			},
			{ status: 422 },
		);
	}
	return Response.json(outcome.stored);
};
