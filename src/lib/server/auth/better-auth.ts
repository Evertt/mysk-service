import { ORIGIN, BETTER_AUTH_SECRET } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { organization } from "better-auth/plugins/organization";
import { adminAc, memberAc, ownerAc } from "better-auth/plugins/organization/access";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { sql } from "drizzle-orm";

import { INVITATION_EXPIRES_IN } from "#lib/auth";
import type { MemberRole } from "#lib/auth";
import { db } from "#lib/server/db/index.ts";
import { invitationMail, sendMail } from "#lib/server/mail";

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
	database: drizzleAdapter(db, { provider: "sqlite" }),
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
			// better-auth's roles plus field engineers, who may manage nothing (see `#lib/auth/roles.ts`).
			roles: {
				owner: ownerAc,
				admin: adminAc,
				member: memberAc,
				engineer: memberAc,
			} satisfies Record<MemberRole, unknown>,
			invitationExpiresIn: INVITATION_EXPIRES_IN,
			sendInvitationEmail: async ({ id, email, role, organization, inviter, invitation }) => {
				const origin = ORIGIN || getRequestEvent().url.origin;
				await sendMail(
					invitationMail({
						to: email,
						organization: organization.name,
						inviter: inviter.user.name,
						role,
						url: new URL(`/invite/${id}`, origin).href,
						expiresAt: invitation.expiresAt,
					}),
				);
			},
		}),
		sveltekitCookies(getRequestEvent), // make sure this is the last plugin in the array
	],
});
