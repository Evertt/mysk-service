/**
 * The Salvo feed's endpoint (`POST /docks/ingest`, its route stub with the token guard) on the
 * seeded demo database: what it answers for a batch it applies, one naming a dock the token's
 * tenant doesn't have (nothing applied), one that isn't valid, a body that isn't JSON or is too
 * large (each as `{ error, message, … }`, `jsonIngest()`), and a missing, unknown or revoked token.
 * What a batch does to the docks is `ingest.spec.ts`'s; the tokens themselves are the core's
 * (`integration-tokens.spec.ts`). The server side of `docks.tenancy.test.ts`.
 */
import type { RequestEvent } from "@sveltejs/kit";
import { isHttpError } from "@sveltejs/kit";
import { describe, expect, test } from "vite-plus/test";

import { issueIntegrationToken, revokeIntegrationToken } from "#lib/server/auth/integrations.ts";
import { demoDockToken } from "#modules/docks/server/demo.ts";
import { maxBatch, maxBodyBytes } from "#modules/docks/server/events.ts";
import { POST } from "#routes/(api)/(modules)/docks/ingest/+server.ts";
import { as, organizationId, rows, shltr, signedOut } from "#unit/lib/server/harness/index.ts";

const shltrId = organizationId("shltr");

let counter = 0;

/** A Salvo event at `dock`, now. */
const salvoEvent = (type: string, dock: string) => ({
	id: `spec-${Date.now().toString(36)}-${++counter}`,
	type,
	dock,
	at: Temporal.Now.instant().toString(),
});

/** What the endpoint answers `body` with, sent with `token` (SHLTR's demo token unless asked). */
async function post(
	body: string | object | ReadableStream<Uint8Array>,
	{ token = demoDockToken as string | null, type = "application/json" } = {},
) {
	const request = new Request("http://localhost/docks/ingest", {
		method: "POST",
		headers: {
			"content-type": type,
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		...(body instanceof ReadableStream
			? { body, duplex: "half" }
			: { body: typeof body === "string" ? body : JSON.stringify(body) }),
	});
	try {
		const response = await signedOut(() => POST({ request } as RequestEvent<never, never>));
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	} catch (thrown) {
		if (isHttpError(thrown)) {
			return { status: thrown.status, body: thrown.body as unknown as Record<string, unknown> };
		}
		throw thrown;
	}
}

/** A dock of SHLTR's live state, by code. */
const stateOf = (code: string) =>
	rows(
		`select s.* from dock_state s join dock_position d on d.id = s.dock_id
		 where d.organization_id = ? and d.code = ?`,
		[shltrId, code],
	);

describe("the feed", () => {
	test("applies a valid batch with SHLTR's token, answering what came of each event", async () => {
		const answer = await post({ events: [salvoEvent("unlock", "DOCK 06")] });
		expect(answer.status).toBe(200);
		expect(answer.body).toMatchObject({ results: [expect.any(Object)], orders: [] });
	});

	test("refuses a dock the token's tenant doesn't have, with a 422 naming it, applying nothing", async () => {
		const before = await stateOf("DOCK 06");
		const answer = await post({
			events: [salvoEvent("unlock", "DOCK 06"), salvoEvent("lock", "DOCK 99")],
		});
		expect(answer).toEqual({
			status: 422,
			body: {
				error: "unknown_codes",
				message: expect.any(String),
				unknown: { docks: ["DOCK 99"] },
			},
		});
		expect(await stateOf("DOCK 06")).toEqual(before);
	});

	test("refuses a batch that isn't valid with a 422 and its issues", async () => {
		const answer = await post({ events: [{ ...salvoEvent("lock", "DOCK 06"), extra: true }] });
		expect(answer.status).toBe(422);
		expect(answer.body).toMatchObject({ error: "invalid_batch", message: expect.any(String) });
		expect(answer.body.issues).toEqual(expect.any(Array));
	});

	test("refuses a body that isn't JSON: 415 for its type, 400 when it doesn't parse", async () => {
		expect(await post("events", { type: "text/plain" })).toEqual({
			status: 415,
			body: { error: "unsupported_media_type", message: expect.any(String) },
		});
		expect(await post("{ events", {})).toEqual({
			status: 400,
			body: { error: "invalid_json", message: expect.any(String) },
		});
	});

	test(`refuses a body larger than ${maxBatch} events take with a 413, reading no more of it`, async () => {
		const padding = "x".repeat(maxBodyBytes);
		const tooLarge = { status: 413, body: { error: "too_large", message: expect.any(String) } };
		expect(await post({ events: [{ ...salvoEvent("lock", "DOCK 06"), padding }] })).toEqual(
			tooLarge,
		);
		// Sent in chunks, without a length: read no further than the limit.
		let pulled = 0;
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled++;
				controller.enqueue(new Uint8Array(64 * 1024).fill(32));
			},
		});
		expect(await post(endless)).toEqual(tooLarge);
		expect(pulled).toBeLessThanOrEqual(Math.ceil(maxBodyBytes / (64 * 1024)) + 1);
	});

	test(`takes a batch of ${maxBatch} events at their longest`, async () => {
		const longest = (i: number) => ({
			...salvoEvent("check_in", "DOCK 06"),
			id: `spec-longest-${Date.now().toString(36)}-${i}`.padEnd(100, "-"),
			payload: {
				carrier: "é".repeat(100),
				plate: "é".repeat(20),
				reference: "é".repeat(50),
			},
		});
		const body = JSON.stringify(
			{ events: Array.from({ length: maxBatch }, (_, i) => longest(i)) },
			null,
			"\t",
		).replaceAll("é", "\\u00e9");
		expect(new TextEncoder().encode(body).byteLength).toBeLessThan(maxBodyBytes);
		expect((await post(body)).status).toBe(200);
	});

	test("refuses a missing or unknown token, or the energy feed's, with a 401", async () => {
		const energy = await as(shltr.owner, () => issueIntegrationToken("energy", "Spec gateway"));
		for (const token of [null, "fwi_unknown", energy.token]) {
			expect((await post({ events: [] }, { token })).status, String(token)).toBe(401);
		}
	});

	test("takes a token until it's revoked", async () => {
		const made = await as(shltr.owner, () => issueIntegrationToken("docks", "Spec feed"));
		expect((await post({ events: [] }, { token: made.token })).status).toBe(200);
		const [stored] = await rows<{ id: number }>(
			`select id from integration_token where organization_id = ? and name = 'Spec feed'`,
			[shltrId],
		);
		await as(shltr.owner, () => revokeIntegrationToken("docks", stored.id));
		expect((await post({ events: [] }, { token: made.token })).status).toBe(401);
	});
});
