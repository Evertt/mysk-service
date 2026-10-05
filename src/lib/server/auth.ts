import { ORIGIN, BETTER_AUTH_SECRET } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { sveltekitCookies } from "better-auth/svelte-kit";

import { db } from "#lib/server/db/index.ts";

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: "sqlite" }),
	emailAndPassword: { enabled: true },
	plugins: [
		sveltekitCookies(getRequestEvent), // make sure this is the last plugin in the array
	],
});
