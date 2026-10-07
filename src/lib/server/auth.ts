import { ORIGIN, BETTER_AUTH_SECRET } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { organization } from "better-auth/plugins/organization";
import { adminAc, memberAc, ownerAc } from "better-auth/plugins/organization/access";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { sql } from "drizzle-orm";

import type { MemberRole } from "#lib/roles.ts";
import { db } from "#lib/server/db/index.ts";

/** The organization a user works in when they sign in: the first one they joined. */
async function initialOrganizationId(userId: string) {
	const row = await db.get<{ id: string } | undefined>(
		sql`select organization_id as id from member where user_id = ${userId} order by created_at limit 1`,
	);
	return row?.id ?? null;
}

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: "sqlite" }),
	// Accounts are created by the seed (and later by an operator or invitations), not by sign-up.
	emailAndPassword: { enabled: true, disableSignUp: true },
	databaseHooks: {
		session: {
			create: {
				before: async (session) => ({
					data: { ...session, activeOrganizationId: await initialOrganizationId(session.userId) },
				}),
			},
		},
	},
	plugins: [
		// Tenants. Organizations are created by the seed (and later by an operator), not by users.
		organization({
			allowUserToCreateOrganization: false,
			disableOrganizationDeletion: true,
			// better-auth's roles plus field engineers, who may manage nothing (see `#lib/roles.ts`).
			roles: {
				owner: ownerAc,
				admin: adminAc,
				member: memberAc,
				engineer: memberAc,
			} satisfies Record<MemberRole, unknown>,
		}),
		sveltekitCookies(getRequestEvent), // make sure this is the last plugin in the array
	],
});
