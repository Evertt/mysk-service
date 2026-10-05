import { form, getRequestEvent, query } from "$app/server";
import { error, redirect } from "@sveltejs/kit";
import { isAPIError } from "better-auth/api";
import { asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { auth } from "#lib/server/auth.js";
import { db } from "#lib/server/db/index.js";
import { member, organization } from "#lib/server/db/schema.js";
import { requireMember, requireUser } from "#lib/server/session.js";

/** Who is signed in, for the user menu. */
export const getCurrentUser = query(async () => {
	const { name, email, image } = requireUser();
	return { name, email, image: image ?? null };
});

/**
 * The organization the user works in, its modules and their role there, plus the other
 * organizations they can switch to.
 */
export const getCurrentTenant = query(async () => {
	const tenant = requireMember();
	const organizations = await db
		.select({ id: organization.id, name: organization.name })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, tenant.user.id))
		.orderBy(asc(member.createdAt));
	return {
		organizationId: tenant.organizationId,
		name: tenant.name,
		roles: tenant.roles,
		modules: tenant.modules,
		organizations,
	};
});

export const switchOrganization = form(
	v.object({ organizationId: v.string() }),
	async ({ organizationId }) => {
		requireUser();
		try {
			// better-auth checks that the user is a member of it.
			await auth.api.setActiveOrganization({
				body: { organizationId },
				headers: getRequestEvent().request.headers,
			});
		} catch (cause) {
			if (isAPIError(cause)) error(403, "You're not a member of that organization");
			throw cause;
		}
		// Everything on the page belongs to the previous organization, so start afresh.
		redirect(303, "/");
	},
);

export const signOut = form(async () => {
	await auth.api.signOut({ headers: getRequestEvent().request.headers });
	redirect(303, "/login");
});
