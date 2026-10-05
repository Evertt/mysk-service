import { form, getRequestEvent, query } from "$app/server";
import { redirect } from "@sveltejs/kit";

import { auth } from "#lib/server/auth.js";
import { requireUser } from "#lib/server/session.js";

/** Who is signed in, for the user menu. */
export const getCurrentUser = query(async () => {
	const { name, email, image } = requireUser();
	return { name, email, image: image ?? null };
});

export const signOut = form(async () => {
	await auth.api.signOut({ headers: getRequestEvent().request.headers });
	redirect(303, "/login");
});
