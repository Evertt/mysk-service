import { ORIGIN, BETTER_AUTH_SECRET } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { organization } from "better-auth/plugins/organization";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { sql } from "drizzle-orm";

import { INVITATION_EXPIRES_IN } from "#lib/members.ts";
import { db } from "#lib/server/db/index.ts";
import { invitationMail } from "#lib/server/invitation-mail.ts";
import { sendMail } from "#lib/server/mail.ts";

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
	// Accounts are created by the seed and by accepting an invitation (`/invite/[id]`), not by sign-up.
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
		// Owners and admins invite people by email; see `settings/members` and `/invite/[id]`.
		organization({
			allowUserToCreateOrganization: false,
			disableOrganizationDeletion: true,
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
