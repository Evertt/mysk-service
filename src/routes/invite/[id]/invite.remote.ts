import { form, getRequestEvent, query } from "$app/server";
import { invalid, redirect } from "@sveltejs/kit";
import { isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { formatNumber } from "#lib/format.ts";
import { invitationState } from "#lib/members.ts";
import { m } from "#lib/paraglide/messages.js";
import { parseRoles } from "#lib/roles.ts";
import { recordActivityAfter } from "#lib/server/activity/log.ts";
import { auth } from "#lib/server/auth.ts";
import { db } from "#lib/server/db/index.ts";
import { invitation, organization, user } from "#lib/server/db/schema.ts";
import { requireUser } from "#lib/server/session.ts";

/**
 * An invitation, looked up by its id from the emailed link. Anyone with the link may open it, so
 * this is the one lookup that isn't scoped to a tenant: the id (random, unguessable) is the key.
 */
async function findInvitation(id: string) {
	const [found] = await db
		.select({
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
			organizationId: invitation.organizationId,
			organization: organization.name,
			inviter: user.name,
		})
		.from(invitation)
		.innerJoin(organization, eq(invitation.organizationId, organization.id))
		.leftJoin(user, eq(invitation.inviterId, user.id))
		.where(eq(invitation.id, id));
	return found ? { ...found, state: invitationState(found) } : undefined;
}

/** What the invitation page shows: who is invited where, and whether it can still be accepted. */
export const getInvitation = query(v.string(), async (id) => {
	const found = await findInvitation(id);
	if (!found) return null;
	const { organization, inviter, state } = found;
	if (state !== "pending") return { id, organization, inviter, state } as const;

	const existing = await db.query.user.findFirst({
		columns: { id: true },
		where: eq(user.email, found.email),
	});
	return {
		id,
		organization,
		inviter,
		state,
		email: found.email,
		roles: parseRoles(found.role ?? "member"),
		expiresAt: found.expiresAt,
		/** Whether the invited email has an account already, to sign in with rather than create. */
		hasAccount: !!existing,
		signedInAs: getRequestEvent().locals.user?.email ?? null,
	};
});

/** The invitation, if it can still be accepted; otherwise the form says why not. */
async function pendingInvitation(id: string) {
	const found = await findInvitation(id);
	if (found?.state !== "pending") invalid(m.auth_invite_no_longer());
	return found;
}

/**
 * Runs better-auth's accept-invitation as `user`, with `headers`' session, and logs it in the
 * invitation's organization (which isn't the user's current one yet).
 */
async function accept(
	found: { id: string; email: string; organizationId: string },
	user: { id: string; name: string },
	headers: Headers,
) {
	try {
		await auth.api.acceptInvitation({ body: { invitationId: found.id }, headers });
	} catch (e) {
		// better-auth's own messages are in English.
		if (isAPIError(e) && e.statusCode < 500) invalid(e.message || m.auth_invite_accept_failed());
		throw e;
	}
	await recordActivityAfter(
		{ action: "accepted", subject: { type: "invitation", id: found.id, label: found.email } },
		{ organizationId: found.organizationId, user },
	);
}

/** Accepts the invitation as the signed-in user, who then works in its organization. */
export const acceptInvitation = form(v.object({ id: v.string() }), async ({ id }) => {
	const signedIn = requireUser();
	const found = await pendingInvitation(id);
	if (found.email !== signedIn.email.toLowerCase()) {
		invalid(m.auth_invite_wrong_email({ email: found.email, current: signedIn.email }));
	}
	// Also makes the invitation's organization the active one.
	await accept(found, signedIn, getRequestEvent().request.headers);
	redirect(303, "/");
});

const MIN_PASSWORD = 8;

/**
 * Creates an account for exactly the invited email address (sign-up is otherwise disabled), signs
 * in with it and accepts the invitation. Opening the emailed link proves the address.
 */
export const createAccount = form(
	v.object({
		id: v.string(),
		name: v.pipe(v.string(), v.trim(), v.nonEmpty(m.auth_invite_name_required)),
		// The leading underscores keep the passwords out of the page after a failed submission.
		_password: v.pipe(
			v.string(),
			v.minLength(MIN_PASSWORD, (issue) =>
				m.auth_invite_password_min({ min: formatNumber(issue.requirement) }),
			),
			v.maxLength(128, (issue) =>
				m.auth_invite_password_max({ max: formatNumber(issue.requirement) }),
			),
		),
		_confirm: v.string(),
	}),
	async ({ id, name, _password, _confirm }, issue) => {
		if (_password !== _confirm) invalid(issue._confirm(m.auth_invite_passwords_differ()));
		const found = await pendingInvitation(id);
		const { email } = found;
		const existing = await db.query.user.findFirst({
			columns: { id: true },
			where: eq(user.email, email),
		});
		if (existing) invalid(m.auth_invite_account_exists({ email }));

		const context = await auth.$context;
		const created = await context.internalAdapter.createUser(
			{ email, name, emailVerified: true },
			{ method: "email-password" },
		);
		await context.internalAdapter.linkAccount({
			userId: created.id,
			providerId: "credential",
			accountId: created.id,
			password: await context.password.hash(_password),
		});

		// Signs in (the cookie goes to the browser through the `sveltekitCookies` plugin), then accepts
		// with the new session.
		const { headers } = await auth.api.signInEmail({
			body: { email, password: _password },
			headers: getRequestEvent().request.headers,
			returnHeaders: true,
		});
		const cookie = headers
			.getSetCookie()
			.map((setCookie) => setCookie.split(";", 1)[0])
			.join("; ");
		await accept(found, created, new Headers({ cookie }));
		redirect(303, "/");
	},
);

/** Signs out someone who opened an invitation for another address, so the right person can. */
export const signOutForInvitation = form(v.object({ id: v.string() }), async ({ id }) => {
	await auth.api.signOut({ headers: getRequestEvent().request.headers });
	redirect(303, `/invite/${encodeURIComponent(id)}`);
});
