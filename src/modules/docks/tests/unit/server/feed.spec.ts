/**
 * The Salvo feed's endpoint (`POST /docks/ingest`, its route stub with the token guard) and its
 * tokens on the seeded demo database: what it answers for a batch it applies, one naming a dock
 * the token's tenant doesn't have (nothing applied), one that isn't valid, a body that isn't JSON
 * or is too large, and a missing, unknown or revoked token; a manager makes a token (only its hash is stored) and
 * revokes it, which a planner may only see. What a batch does to the docks is `ingest.spec.ts`'s. The
 * server side of `docks.tenancy.test.ts`, which keeps the settings page.
 */
import type { RequestEvent } from "@sveltejs/kit";
import { isHttpError } from "@sveltejs/kit";
import { describe, expect, test } from "vite-plus/test";

import { issueIntegrationToken } from "#lib/server/auth/integrations.ts";
import { demoDockToken } from "#modules/docks/server/demo.ts";
import { maxBatch, maxBodyBytes } from "#modules/docks/server/events.ts";
import {
	createDockToken,
	getDockSettings,
	revokeDockToken,
} from "#modules/docks/settings/settings.remote.ts";
import { POST } from "#routes/(api)/(modules)/docks/ingest/+server.ts";
import {
	as,
	data,
	organizationId,
	rows,
	shltr,
	signedOut,
	submit,
} from "#unit/lib/server/harness/index.ts";

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
		expect(answer).toEqual({ status: 422, body: { error: "unknown_docks", docks: ["DOCK 99"] } });
		expect(await stateOf("DOCK 06")).toEqual(before);
	});

	test("refuses a batch that isn't valid with a 422 and its issues", async () => {
		const answer = await post({ events: [{ ...salvoEvent("lock", "DOCK 06"), extra: true }] });
		expect(answer.status).toBe(422);
		expect(answer.body).toMatchObject({ error: "invalid_batch" });
		expect(answer.body.issues).toEqual(expect.any(Array));
	});

	test("refuses a body that isn't JSON: 415 for its type, 400 when it doesn't parse", async () => {
		expect(await post("events", { type: "text/plain" })).toEqual({
			status: 415,
			body: { error: "unsupported_media_type" },
		});
		expect(await post("{ events", {})).toEqual({ status: 400, body: { error: "invalid_json" } });
	});

	test(`refuses a body larger than ${maxBatch} events take with a 413, reading no more of it`, async () => {
		const padding = "x".repeat(maxBodyBytes);
		expect(await post({ events: [{ ...salvoEvent("lock", "DOCK 06"), padding }] })).toEqual({
			status: 413,
			body: { error: "too_large" },
		});
		// Sent in chunks, without a length: read no further than the limit.
		let pulled = 0;
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled++;
				controller.enqueue(new Uint8Array(64 * 1024).fill(32));
			},
		});
		expect(await post(endless)).toEqual({ status: 413, body: { error: "too_large" } });
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
});

describe("the feed's tokens", () => {
	test("a manager makes one, shown once and stored as its hash, which the feed takes until revoked", async () => {
		const made = await as(shltr.owner, () => submit(createDockToken, { name: "Spec feed" }));
		expect(made.status).toBe(200);
		expect(made.refreshed).toContain("getDockSettings");
		const { token } = made.data as { token: string };
		expect(token).toMatch(/^fwi_[0-9a-f]{40}$/);
		const [stored] = await rows<{ id: number; token_hash: string; prefix: string }>(
			`select id, token_hash, prefix from integration_token where organization_id = ? and name = 'Spec feed'`,
			[shltrId],
		);
		expect(stored.token_hash).not.toContain(token.slice(4));
		expect(token.startsWith(stored.prefix)).toBe(true);
		const listed = await as(shltr.owner, () => data(getDockSettings));
		expect(JSON.stringify(listed.tokens)).not.toContain(token);
		expect((await post({ events: [] }, { token })).status).toBe(200);

		const revoked = await as(shltr.owner, () => submit(revokeDockToken, { id: String(stored.id) }));
		expect(revoked.status).toBe(200);
		expect((await post({ events: [] }, { token })).status).toBe(401);
	});

	test("are a planner's to see, by their first characters, but not to make or revoke", async () => {
		const [demo] = await rows<{ id: number; revoked_at: number | null }>(
			`select id, revoked_at from integration_token where organization_id = ? and module_id = 'docks'
			 order by id limit 1`,
			[shltrId],
		);
		await as(shltr.member, async () => {
			const settings = await data(getDockSettings);
			expect(settings.canManage).toBe(false);
			expect(settings.tokens.map((token) => token.id)).toContain(demo.id);
			expect(Object.keys(settings.tokens[0]).toSorted()).toEqual(
				["createdAt", "createdBy", "id", "lastUsedAt", "name", "prefix", "revokedAt"].toSorted(),
			);
			expect(await submit(createDockToken, { name: "Planner's" })).toMatchObject({ status: 403 });
			expect(await submit(revokeDockToken, { id: String(demo.id) })).toMatchObject({
				status: 403,
			});
		});
		expect(await rows(`select revoked_at from integration_token where id = ?`, [demo.id])).toEqual([
			{ revoked_at: demo.revoked_at },
		]);
		expect((await post({ events: [] })).status).toBe(200);
	});
});
