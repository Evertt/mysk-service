import { form, getRequestEvent } from "$app/server";
import { invalid, redirect } from "@sveltejs/kit";
import { isAPIError } from "better-auth/api";
import * as v from "valibot";

import { m } from "#lib/paraglide/messages.js";
import { isFieldEngineer } from "#lib/roles.ts";
import { auth } from "#lib/server/auth.ts";
import { loadTenant } from "#lib/server/session.ts";

/** Only local paths, so the login can't be used to send people to another site. */
const safeRedirect = (path: string | undefined) =>
	path?.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";

export const login = form(
	v.object({
		// One message at a time: "valid email" means nothing while the field is still empty.
		email: v.config(
			v.pipe(
				v.string(),
				v.trim(),
				v.nonEmpty(m.auth_email_required),
				v.email(m.auth_email_invalid),
			),
			{ abortPipeEarly: true },
		),
		// The leading underscore keeps the password out of the page after a failed submission.
		_password: v.pipe(v.string(), v.nonEmpty(m.auth_password_required)),
		redirectTo: v.optional(v.string()),
	}),
	async ({ email, _password, redirectTo }) => {
		let userId: string;
		try {
			// Sets the session cookie through the `sveltekitCookies` plugin.
			({
				user: { id: userId },
			} = await auth.api.signInEmail({
				body: { email, password: _password },
				headers: getRequestEvent().request.headers,
			}));
		} catch (e) {
			if (isAPIError(e) && e.statusCode === 401) invalid(m.auth_incorrect());
			if (isAPIError(e) && e.statusCode < 500) invalid(e.message || m.auth_failed());
			throw e;
		}
		// Field engineers start in their portal; the office app isn't theirs.
		const tenant = await loadTenant(userId, null);
		if (tenant && isFieldEngineer(tenant.roles) && !safeRedirect(redirectTo).startsWith("/my")) {
			redirect(303, "/my");
		}
		redirect(303, safeRedirect(redirectTo));
	},
);
