/**
 * What the energy module's harness specs share: Riedel's site as stored, a reading of the latest
 * quarter hour, and the meters' feed (`/energy/ingest`, its route stub with the token guard) as a
 * gateway calls it.
 */
import type { RequestEvent } from "@sveltejs/kit";
import { isHttpError } from "@sveltejs/kit";

import { DEMO_ENERGY_TOKEN } from "#modules/energy/server/riedel.ts";
import { GET, POST } from "#routes/(api)/(modules)/energy/ingest/+server.ts";
import { organizationId, rows, signedOut, value } from "#unit/lib/server/harness/index.ts";

export const shltrId = organizationId("shltr");

/** Riedel's energy site (SHLTR's first), its zones and doors by code. */
export async function riedel() {
	const siteId = Number(
		await value(`select id from energy_site where organization_id = ? order by id limit 1`, [
			shltrId,
		]),
	);
	const zones = await rows<{ id: number; code: string; name: string }>(
		`select id, code, name from energy_zone where energy_site_id = ? order by position`,
		[siteId],
	);
	const doors = await rows<{ id: number; code: string; equipment_id: number | null }>(
		`select id, code, equipment_id from energy_door where energy_site_id = ? order by code`,
		[siteId],
	);
	return {
		siteId,
		zone: (code: string) => zones.find((zone) => zone.code === code)!,
		door: (code: string) => doors.find((door) => door.code === code)!,
	};
}

/** The start of the latest quarter hour that has ended. */
export function lastQuarter(now = Temporal.Now.instant()) {
	const seconds = Math.floor(now.epochMilliseconds / 1000);
	return Temporal.Instant.fromEpochMilliseconds((seconds - (seconds % 900) - 900) * 1000);
}

/** A reading of `zone` for the interval from `start`, at `avgKw`. */
export const readingOf = (zone: string, start: Temporal.Instant, avgKw: number) => ({
	zone,
	start: start.toString(),
	avgKw,
	peakKw: Math.round(avgKw * 105) / 100,
	kwh: avgKw / 4,
});

interface Sent {
	token?: string | null;
	type?: string;
	method?: "GET" | "POST";
}

/**
 * What the feed answers `body` with (a JSON body unless it's a string), sent with `token`
 * (SHLTR's demo token unless asked; `null` for none): its status and JSON body.
 */
export async function feed(
	body: string | object | ReadableStream<Uint8Array> = {},
	{ token = DEMO_ENERGY_TOKEN, type = "application/json", method = "POST" }: Sent = {},
) {
	const headers = { "content-type": type, ...(token ? { authorization: `Bearer ${token}` } : {}) };
	const request = new Request("http://localhost/energy/ingest", {
		method,
		headers,
		...(method === "POST"
			? body instanceof ReadableStream
				? { body, duplex: "half" }
				: { body: typeof body === "string" ? body : JSON.stringify(body) }
			: {}),
	});
	const handler = method === "GET" ? GET : POST;
	try {
		const response = await signedOut(() => handler({ request } as RequestEvent<never, never>));
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	} catch (thrown) {
		if (isHttpError(thrown)) {
			return { status: thrown.status, body: thrown.body as unknown as Record<string, unknown> };
		}
		throw thrown;
	}
}
