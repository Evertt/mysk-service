import { form, getRequestEvent } from "$app/server";
import { invalid, redirect } from "@sveltejs/kit";
import { isAPIError } from "better-auth/api";
import * as v from "valibot";

import { auth } from "#lib/server/auth.js";

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
				v.nonEmpty("Enter your email address."),
				v.email("Enter a valid email address."),
			),
			{ abortPipeEarly: true },
		),
		// The leading underscore keeps the password out of the page after a failed submission.
		_password: v.pipe(v.string(), v.nonEmpty("Enter your password.")),
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
			if (isAPIError(e) && e.statusCode === 401) invalid("Incorrect email or password.");
			if (isAPIError(e) && e.statusCode < 500) invalid(e.message || "Couldn't sign you in.");
			throw e;
		}
		redirect(303, safeRedirect(redirectTo));
	},
);
