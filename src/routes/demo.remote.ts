/**
 * One-click sign-in to the SHLTR demo, for trying each side of the app on staging: the login
 * page's Admin, Engineer and Customer buttons, and the user menus' "View as" (`view-as.svelte`),
 * which switches between them without signing out first. Passwordless, so it exists only where
 * `DEMO_SIGN_IN` is `true` (staging's `wrangler.jsonc` vars, a local `.env`): elsewhere nothing of
 * it renders and every call is a 404, before anything posted is read.
 */
import { DEMO_SIGN_IN } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { error, redirect } from "@sveltejs/kit";
import { isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { auth, loadTenant } from "#lib/server/auth/index.ts";
import { DEMO_PASSWORD } from "#lib/server/db/demo.ts";
import { db } from "#lib/server/db/index.ts";
import { user } from "#lib/server/db/schema.ts";
import { forAnyone } from "#lib/server/remote-functions.ts";

import { demoAccount, demoOrganizationId, demoRoleOf } from "./demo-accounts.server.ts";

/** Whether the login page shows the demo buttons. */
export const demoSignInEnabled = forAnyone.query(() => DEMO_SIGN_IN);

/**
 * The demo account of `role`, checked: or a 400 for anything that isn't a demo role, and a 404
 * for an account that isn't the demo's (any more): in SHLTR, where its session will work (its
 * first organization, see `initialOrganizationId` in `better-auth.ts`), with the role.
 */
async function checkedAccount(role: unknown) {
	const account = demoAccount(role);
	if (!account) error(400, m.auth_demo_unknown());
	const [found] = await db.select({ id: user.id }).from(user).where(eq(user.email, account.email));
	const tenant = found && (await loadTenant(found.id, null));
	if (!tenant || tenant.organizationId !== demoOrganizationId || !account.hasRole(tenant.roles)) {
		error(404, m.auth_demo_unavailable());
	}
	return account;
}

/**
 * Signs in as `account` through better-auth with the seed's demo password, so the session, its
 * cookie and its organization are as after signing in with the form. A 404 where it can't (its
 * password isn't the demo's any more), which leaves the request's own session as it was.
 */
async function signInAs(account: { email: string }) {
	try {
		// Sets the session cookie through the `sveltekitCookies` plugin.
		await auth.api.signInEmail({
			body: { email: account.email, password: DEMO_PASSWORD },
			headers: getRequestEvent().request.headers,
		});
	} catch (e) {
		if (isAPIError(e) && e.statusCode < 500) error(404, m.auth_demo_unavailable());
		throw e;
	}
}

/**
 * Signs in as the demo user of the role posted (`planner`, `engineer` or `customer`), then goes to
 * its home. Unchecked: the flag comes first, so without it whatever is posted is a 404, and the
 * role is checked here.
 */
export const demoSignIn = forAnyone.form("unchecked", async (data: { role: string }) => {
	if (!DEMO_SIGN_IN) error(404, m.common_error_not_found());
	const account = await checkedAccount(data.role);
	await signInAs(account);
	redirect(303, account.home);
});

/**
 * Whether the signed-in user may view the demo as its other roles: the flag is on, and their
 * session works in the demo's organization (SHLTR), whoever they are there. Anyone else (another
 * tenant's users, also on staging) never sees the switch.
 */
function inDemo() {
	const { user, tenant } = getRequestEvent().locals;
	return DEMO_SIGN_IN && !!user && tenant?.organizationId === demoOrganizationId;
}

/**
 * The user menus' "View as": `null` where it isn't shown (see `inDemo()`), else the demo role of
 * who is signed in (`null` for SHLTR's other people).
 */
export const getViewAs = forAnyone.query(() => {
	if (!inDemo()) return null;
	return { current: demoRoleOf(getRequestEvent().locals.user!.email) ?? null };
});

/**
 * Views the demo as the role posted: signs in as the role's demo user, then ends the session it was
 * posted from, in one request, and goes to the role's home. A 404 without the flag or outside the
 * demo's organization, whatever is posted; the role is checked, and the account. The old session
 * ends only once the sign-in worked: where it can't (a demo password was changed), the clicker
 * stays signed in as before.
 */
export const viewAs = forAnyone.form("unchecked", async (data: { role: string }) => {
	if (!inDemo()) error(404, m.common_error_not_found());
	const account = await checkedAccount(data.role);
	const { token } = getRequestEvent().locals.session!;
	await signInAs(account);
	// Its row only, as better-auth's sign-out deletes it: the cookie is the new session's now, which
	// `signOut` (or `revokeSession`, refreshing the old one's) would overwrite.
	await (await auth.$context).internalAdapter.deleteSession(token);
	redirect(303, account.home);
});
