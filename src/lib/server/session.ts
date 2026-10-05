import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

/**
 * The signed-in user, or a 401. Call it first in every remote function that needs a login: the
 * redirect to /login in `hooks.server.ts` only guards page requests, not remote function calls.
 */
export function requireUser() {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");
	return user;
}
