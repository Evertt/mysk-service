/**
 * The meters' feed endpoint (`/energy/ingest`, its route stub with the token guard) on the seeded
 * demo database: what it answers a gateway (the token's sites and codes; a batch stored; another
 * tenant's or an unknown site; codes the site hasn't; a batch that isn't valid, isn't JSON or is too
 * large, each as `{ error, message, … }`, `jsonIngest()`; a missing, unknown, revoked or other
 * module's token), storing nothing of a refused batch. What a batch stores and the alerts it raises
 * are `ingest.spec.ts`'s; the tokens themselves are the core's (`integration-tokens.spec.ts`). The
 * server side of `energy.tenancy.test.ts`.
 */
import { describe, expect, test } from "vite-plus/test";

import { issueIntegrationToken, revokeIntegrationToken } from "#lib/server/auth/integrations.ts";
import { as, rows, shltr, value } from "#unit/lib/server/harness/index.ts";

import { feed, lastQuarter, readingOf, riedel, shltrId } from "./energy.test-support.ts";

const readings = () => value<number>(`select count(*) from energy_reading`);

describe("the feed", () => {
	test("lists its tenant's sites with their zones' and doors' codes", async () => {
		const { siteId } = await riedel();
		const answer = await feed({}, { method: "GET" });
		expect(answer.status).toBe(200);
		const sites = answer.body.sites as { id: number; name: string; zones: unknown[] }[];
		expect(sites).toContainEqual(
			expect.objectContaining({ id: siteId, name: "Riedel Ede — Productielocatie" }),
		);
		expect(JSON.stringify(sites)).toContain("Z-R61");
	});

	test("stores a valid batch, answering what it stored", async () => {
		const { siteId, zone } = await riedel();
		const start = lastQuarter().subtract({ hours: 3 });
		const answer = await feed({ site: siteId, readings: [readingOf("Z-R61", start, 10.5)] });
		expect(answer).toMatchObject({ status: 200, body: { readings: 1 } });
		expect(
			await value(`select avg_kw from energy_reading where zone_id = ? and start = ?`, [
				zone("Z-R61").id,
				start.epochMilliseconds / 1000,
			]),
		).toBe(10.5);
	});

	test("takes only its tenant's site and the site's codes, storing nothing of a refused batch", async () => {
		const { siteId } = await riedel();
		const before = await readings();
		const start = lastQuarter().subtract({ hours: 2 });
		expect(await feed({ site: 999_999, readings: [readingOf("Z-R61", start, 10)] })).toMatchObject({
			status: 404,
			body: { error: "unknown_site" },
		});
		expect(
			await feed({
				site: siteId,
				readings: [readingOf("Z-R61", start, 10), readingOf("Z-NORTH", start, 10)],
				doorEvents: [{ door: "DOCK 05", at: start.toString(), state: "open" }],
			}),
		).toMatchObject({
			status: 422,
			body: { error: "unknown_codes", unknown: { zones: ["Z-NORTH"], doors: ["DOCK 05"] } },
		});
		const invalid = await feed({
			site: siteId,
			readings: [{ ...readingOf("Z-R61", start, 10), kwh: 9 }],
		});
		expect(invalid).toMatchObject({ status: 422, body: { error: "invalid_batch" } });
		expect(invalid.body.issues).toEqual(expect.any(Array));
		expect(await readings()).toBe(before);
		// Only SHLTR has energy data at all.
		expect(
			await rows(`select distinct organization_id from energy_reading where organization_id <> ?`, [
				shltrId,
			]),
		).toEqual([]);
	});

	test("refuses a body that isn't JSON (415, 400) or is too large (413)", async () => {
		expect(await feed("readings", { type: "text/plain" })).toMatchObject({
			status: 415,
			body: { error: "unsupported_media_type" },
		});
		expect(await feed("{ readings")).toMatchObject({
			status: 400,
			body: { error: "invalid_json" },
		});
		expect(await feed(JSON.stringify({ padding: "x".repeat(1_000_001) }))).toMatchObject({
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
		expect(await feed(endless)).toMatchObject({ status: 413, body: { error: "too_large" } });
		expect(pulled).toBeLessThan(20);
	});

	test("refuses a missing or unknown token, or the docks feed's, with a 401", async () => {
		const docks = await as(shltr.owner, () => issueIntegrationToken("docks", "Spec docks feed"));
		for (const token of [null, "fwi_unknown", docks.token]) {
			expect((await feed({}, { token, method: "GET" })).status, String(token)).toBe(401);
		}
	});

	test("takes a token until it's revoked", async () => {
		const made = await as(shltr.owner, () => issueIntegrationToken("energy", "Spec gateway"));
		expect((await feed({}, { token: made.token, method: "GET" })).status).toBe(200);
		const [stored] = await rows<{ id: number }>(
			`select id from integration_token where organization_id = ? and name = 'Spec gateway'`,
			[shltrId],
		);
		await as(shltr.owner, () => revokeIntegrationToken("energy", stored.id));
		expect((await feed({}, { token: made.token, method: "GET" })).status).toBe(401);
	});
});
