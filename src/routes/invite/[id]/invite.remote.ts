import { form, getRequestEvent, query } from "$app/server";
import { invalid, redirect } from "@sveltejs/kit";
import { isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { invitationState, parseRoles } from "#lib/members.js";
import { auth } from "#lib/server/auth.js";
import { db } from "#lib/server/db/index.js";
import { invitation, organization, user } from "#lib/server/db/schema.js";
import { requireUser } from "#lib/server/session.js";

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
	if (found?.state !== "pending") invalid("This invitation can no longer be accepted.");
	return found;
}

/** Runs better-auth's accept-invitation as the user with `headers`' session. */
async function accept(id: string, headers: Headers) {
	try {
		await auth.api.acceptInvitation({ body: { invitationId: id }, headers });
	} catch (e) {
		if (isAPIError(e) && e.statusCode < 500)
			invalid(e.message || "Couldn't accept the invitation.");
		throw e;
	}
}

/** Accepts the invitation as the signed-in user, who then works in its organization. */
export const acceptInvitation = form(v.object({ id: v.string() }), async ({ id }) => {
	const signedIn = requireUser();
	const found = await pendingInvitation(id);
	if (found.email !== signedIn.email.toLowerCase()) {
		invalid(`This invitation is for ${found.email}, not ${signedIn.email}.`);
	}
	// Also makes the invitation's organization the active one.
	await accept(id, getRequestEvent().request.headers);
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
		name: v.pipe(v.string(), v.trim(), v.nonEmpty("Enter your name.")),
		// The leading underscores keep the passwords out of the page after a failed submission.
		_password: v.pipe(
			v.string(),
			v.minLength(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`),
			v.maxLength(128, "Use at most 128 characters."),
		),
		_confirm: v.string(),
	}),
	async ({ id, name, _password, _confirm }, issue) => {
		if (_password !== _confirm) invalid(issue._confirm("The passwords don't match."));
		const { email } = await pendingInvitation(id);
		const existing = await db.query.user.findFirst({
			columns: { id: true },
			where: eq(user.email, email),
		});
		if (existing) invalid(`There's an account for ${email} already. Sign in to accept.`);

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
		await accept(id, new Headers({ cookie }));
		redirect(303, "/");
	},
);

/** Signs out someone who opened an invitation for another address, so the right person can. */
export const signOutForInvitation = form(v.object({ id: v.string() }), async ({ id }) => {
	await auth.api.signOut({ headers: getRequestEvent().request.headers });
	redirect(303, `/invite/${encodeURIComponent(id)}`);
});
