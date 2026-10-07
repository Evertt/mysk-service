import { form, getRequestEvent, query } from "$app/server";
import { error, redirect } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { m } from "#lib/paraglide/messages.js";
import { isFieldEngineer } from "#lib/roles.js";
import { auth } from "#lib/server/auth.js";
import { db } from "#lib/server/db/index.js";
import { member, organization } from "#lib/server/db/schema.js";
import { requireMember, requireTenant, requireUser } from "#lib/server/session.js";

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
	// The app shell awaits this, so field engineers who navigate here go to their portal instead.
	if (isFieldEngineer(requireTenant().roles)) redirect(303, "/my");
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
		const user = requireUser();
		// better-auth checks this too, but then also clears the active organization, which would
		// move the user to their first one instead of leaving them where they were.
		const [membership] = await db
			.select({ id: member.id })
			.from(member)
			.where(and(eq(member.userId, user.id), eq(member.organizationId, organizationId)));
		if (!membership) error(403, m.common_error_not_a_member());
		await auth.api.setActiveOrganization({
			body: { organizationId },
			headers: getRequestEvent().request.headers,
		});
		// Everything on the page belongs to the previous organization, so start afresh.
		redirect(303, "/");
	},
);

export const signOut = form(async () => {
	await auth.api.signOut({ headers: getRequestEvent().request.headers });
	redirect(303, "/login");
});
