/**
 * The developers: signed-in users whose email is in `DEVELOPER_EMAILS`. Only they may open the bug
 * reports' pages (`/ops/bug-reports`), whichever organization they're in, if any.
 */
import { error } from "@sveltejs/kit";

import { requireUser } from "#lib/server/auth/index.ts";

import { bugReportSettings } from "./settings.ts";

/** Whether `email` is a developer's. */
export const isDeveloper = (email: string) =>
	bugReportSettings.developers.includes(email.trim().toLowerCase());

/**
 * The signed-in developer; everyone else gets a 404 (signed out a 401), so the pages don't say
 * they exist. The gate of `forDevelopers` (`#lib/server/remote-functions.ts`).
 */
export function requireDeveloper() {
	const user = requireUser();
	if (!isDeveloper(user.email)) error(404, m.common_error_not_found());
	return user;
}
