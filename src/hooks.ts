// First: Temporal, where the browser (or Node) has none yet, before any other module runs.
import "temporal-polyfill/global";
import type { Reroute, Transport } from "@sveltejs/kit/hooks";

import { temporalReducers, temporalRevivers } from "#lib/dates.ts";
import { deLocalizeUrl } from "#lib/paraglide/runtime.js";

export const reroute: Reroute = (request) => deLocalizeUrl(request.url).pathname;

/**
 * Days and moments (see `day` and `moment` in `#lib/server/db/columns.ts`) cross between the server
 * and the browser as themselves: in load data and remote functions' arguments and answers alike.
 */
export const transport: Transport = Object.fromEntries(
	Object.entries(temporalReducers).map(([type, encode]) => [
		type,
		{ encode, decode: temporalRevivers[type as keyof typeof temporalRevivers] },
	]),
);
