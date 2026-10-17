/**
 * One-click sign-in to the SHLTR demo, for trying each side of the app on staging: the login
 * page's Admin, Engineer and Customer buttons. Passwordless, so it exists only where `DEMO_SIGN_IN`
 * is `true` (staging's `wrangler.jsonc` vars, a local `.env`): elsewhere the buttons don't render
 * and every call is a 404, before anything posted is read.
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

import { demoAccount, demoOrganizationId } from "./demo-accounts.server.ts";

/** Whether the login page shows the demo buttons. */
export const demoSignInEnabled = forAnyone.query(() => DEMO_SIGN_IN);

/**
 * Signs in as the demo user of the role posted (`admin`, `engineer` or `customer`), through
 * better-auth with the seed's demo password, so the session, its cookie and its organization are as
 * after signing in with the form; then goes to the role's home. Unchecked: the flag comes first, so
 * without it whatever is posted is a 404, and the role is checked here.
 */
export const demoSignIn = forAnyone.form("unchecked", async (data: { role: string }) => {
	if (!DEMO_SIGN_IN) error(404, m.common_error_not_found());
	const account = demoAccount(data.role);
	if (!account) error(400, m.auth_demo_unknown());

	// The account must be the demo's: in SHLTR, where its session will work (its first
	// organization, see `initialOrganizationId` in `better-auth.ts`), with the button's role.
	const [found] = await db.select({ id: user.id }).from(user).where(eq(user.email, account.email));
	const tenant = found && (await loadTenant(found.id, null));
	if (!tenant || tenant.organizationId !== demoOrganizationId || !account.hasRole(tenant.roles)) {
		error(404, m.auth_demo_unavailable());
	}

	try {
		// Sets the session cookie through the `sveltekitCookies` plugin.
		await auth.api.signInEmail({
			body: { email: account.email, password: DEMO_PASSWORD },
			headers: getRequestEvent().request.headers,
		});
	} catch (e) {
		// Its password isn't the demo's any more.
		if (isAPIError(e) && e.statusCode < 500) error(404, m.auth_demo_unavailable());
		throw e;
	}
	redirect(303, account.home);
});
