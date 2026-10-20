import { getRequestEvent } from "$app/server";
import { error, redirect } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { isCustomerContact, isFieldEngineer } from "#lib/auth/index.ts";
import {
	auth,
	currentCustomer,
	currentEngineer,
	currentTenant,
	currentUser,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { member, organization } from "#lib/server/db/schema.ts";
import { forAnyone, forAnyRole, forUsers } from "#lib/server/remote-functions.ts";

/**
 * Who is signed in, as every shell shows them (the office's user menu and dashboard, the portals'
 * headers): their name, email and avatar, the organization they work in and, for a customer's
 * contact, their customer. A field engineer's name is their engineer record's, as the tenant knows
 * them: the name their work orders are signed in, which their account's may differ from.
 */
export const getCurrentUser = forAnyRole.query(async () => {
	const { user, roles, name: organization } = currentTenant();
	const [engineer, access] = await Promise.all([
		isFieldEngineer(roles) ? currentEngineer() : null,
		isCustomerContact(roles) ? currentCustomer() : null,
	]);
	return {
		name: engineer?.name ?? user.name,
		email: user.email,
		image: user.image ?? null,
		organization,
		customer: access?.customer.name ?? null,
	};
});

/**
 * The organization the user works in, its modules and their role there, plus the other
 * organizations they can switch to.
 */
export const getCurrentTenant = forAnyRole.query(async () => {
	const tenant = currentTenant();
	// The app shell awaits this, so field engineers and customers' contacts who navigate here go to
	// their portal instead.
	if (isFieldEngineer(tenant.roles)) redirect(303, "/my");
	if (isCustomerContact(tenant.roles)) redirect(303, "/portal");
	const organizations = await db
		.select({ id: organization.id, name: organization.name })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, tenant.user.id))
		.orderBy(asc(member.createdAt));
	return {
		userId: tenant.user.id,
		organizationId: tenant.organizationId,
		name: tenant.name,
		roles: tenant.roles,
		modules: tenant.modules,
		organizations,
	};
});

/**
 * The modules the current organization has on: what the extension slots show (`ExtensionSlot`),
 * on the office's pages and the portals' alike (unlike `getCurrentTenant`, which sends field
 * engineers and customers' contacts to their portal).
 */
export const getTenantModules = forAnyRole.query(async () => currentTenant().modules);

export const switchOrganization = forUsers.form(
	v.object({ organizationId: v.string() }),
	async ({ organizationId }) => {
		const user = currentUser();
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

/**
 * Signs out, back to the login page: the one way to, which every shell's `<SignOutButton>` submits
 * (`shell-chrome.spec.ts` refuses another).
 */
export const signOut = forAnyone.form(async () => {
	await auth.api.signOut({ headers: getRequestEvent().request.headers });
	redirect(303, "/login");
});
