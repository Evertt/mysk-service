import { getRequestEvent } from "$app/server";
import { redirect } from "@sveltejs/kit";
import { isAPIError } from "better-auth/api";
import * as v from "valibot";

import { auth } from "#lib/server/auth/index.ts";
import { Refused } from "#lib/server/refused.ts";
import { forAnyone } from "#lib/server/remote-functions.ts";

import { safeRedirect } from "./redirect.ts";

export const login = forAnyone.form(
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
		try {
			// Sets the session cookie through the `sveltekitCookies` plugin.
			await auth.api.signInEmail({
				body: { email, password: _password },
				headers: getRequestEvent().request.headers,
			});
		} catch (e) {
			if (isAPIError(e) && e.statusCode === 401) throw new Refused(m.auth_incorrect());
			if (isAPIError(e) && e.statusCode < 500) throw new Refused(e.message || m.auth_failed());
			throw e;
		}
		// Back to the page they came for. Where it's another shell's than theirs (`shellOf()`), that
		// sends them home: the office shell an engineer or contact (`getCurrentTenant`), as the page
		// loads client-side; a page loaded in full the guard (`handleGuard` in `hooks.server.ts`).
		redirect(303, safeRedirect(redirectTo));
	},
);
