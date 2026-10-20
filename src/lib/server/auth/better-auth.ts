import { ORIGIN, BETTER_AUTH_SECRET } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { organization } from "better-auth/plugins/organization";
import { adminAc, memberAc, ownerAc } from "better-auth/plugins/organization/access";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { sql } from "drizzle-orm";

import { INVITATION_EXPIRES_IN } from "#lib/auth/index.ts";
import type { MemberRole } from "#lib/auth/index.ts";
import * as authSchema from "#lib/server/db/auth.schema.ts";
import { db } from "#lib/server/db/index.ts";
import { invitationMail, sendMail } from "#lib/server/mail/index.ts";

/**
 * The organization a user works in when they sign in: the first one they joined, or none yet (e.g.
 * while accepting their invitation).
 */
async function initialOrganizationId(userId: string) {
	// `all`, not `get`: drizzle's `get` fails on a raw query without rows.
	const [row] = await db.all<{ id: string }>(
		sql`select organization_id as id from member where user_id = ${userId} order by created_at limit 1`,
	);
	return row?.id ?? null;
}

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	// The schema given, so the adapter doesn't ask `db` for it while the module loads: on Cloudflare
	// the database is reached only inside a request (`#lib/server/db/durable.ts`).
	database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
	// Not at start-up, outside any request, for the same reason; the migrations' spec
	// (`migrations.spec.ts`) checks the tables against the schema instead.
	advanced: { database: { validateSchema: false } },
	// Accounts are created by the seed, `pnpm run org:create` and accepting an invitation
	// (`/invite/[id]`), not by sign-up.
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
		// Tenants. Organizations are created by the seed and `pnpm run org:create`, not by users.
		// Owners and admins invite people by email; see `settings/members` and `/invite/[id]`.
		organization({
			allowUserToCreateOrganization: false,
			disableOrganizationDeletion: true,
			// better-auth's roles plus field engineers and customer contacts, who may manage nothing
			// (see `#lib/auth/roles.ts`).
			roles: {
				owner: ownerAc,
				admin: adminAc,
				member: memberAc,
				engineer: memberAc,
				customer: memberAc,
			} satisfies Record<MemberRole, unknown>,
			invitationExpiresIn: INVITATION_EXPIRES_IN,
			sendInvitationEmail: async ({ id, email, role, organization, inviter, invitation }) => {
				await sendMail(
					invitationMail({
						to: email,
						organization: organization.name,
						inviter: inviter.user.name,
						role,
						url: new URL(`/invite/${id}`, ORIGIN || getRequestEvent().url.origin).href,
						expiresAt: invitation.expiresAt,
					}),
				);
			},
		}),
		sveltekitCookies(getRequestEvent), // make sure this is the last plugin in the array
	],
});
