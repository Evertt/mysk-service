import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, asc, eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import { isModuleId, type ModuleId } from "#lib/module-ids.js";
import { m } from "#lib/paraglide/messages.js";
import { isFieldEngineer } from "#lib/roles.js";
import { db } from "#lib/server/db/index.js";
import { engineer, member, organization, organizationModule } from "#lib/server/db/schema.js";

/** The organization a request works in, with the signed-in user's role there. */
export interface Tenant {
	organizationId: string;
	name: string;
	slug: string;
	/** The member's roles, see `memberRoles` in `#lib/roles.ts` (a member may have several). */
	roles: string[];
	modules: string[];
}

/**
 * The tenant for a signed-in user: their active organization, or the first they joined if that's
 * not set (or they're no longer a member of it). Loaded once per request in `hooks.server.ts`.
 */
export async function loadTenant(
	userId: string,
	activeOrganizationId: string | null | undefined,
): Promise<Tenant | undefined> {
	const memberships = await db
		.select({
			organizationId: member.organizationId,
			role: member.role,
			name: organization.name,
			slug: organization.slug,
		})
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, userId))
		.orderBy(asc(member.createdAt));
	const current =
		memberships.find((row) => row.organizationId === activeOrganizationId) ?? memberships[0];
	if (!current) return undefined;

	const modules = await db
		.select({ id: organizationModule.moduleId })
		.from(organizationModule)
		.where(eq(organizationModule.organizationId, current.organizationId));
	return {
		organizationId: current.organizationId,
		name: current.name,
		slug: current.slug,
		roles: current.role.split(",").map((role) => role.trim()),
		// A row for a module that's no longer there (removed from the app) does nothing.
		modules: modules.map((row) => row.id).filter(isModuleId),
	};
}

/**
 * The signed-in user, or a 401. Call it first in every remote function that needs a login: the
 * redirect to /login in `hooks.server.ts` only guards page requests, not remote function calls.
 * Remote functions that touch tenant data use `requireMember()` instead.
 */
export function requireUser() {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, m.common_error_not_signed_in());
	return user;
}

/**
 * The signed-in user and their current tenant, whatever their role there, or a 401/403. For code
 * that both the office and the engineer portal use (`inTenant`, the stock ledger); remote functions
 * start with `requireMember()` or `requireEngineer()` instead.
 */
export function requireTenant() {
	const user = requireUser();
	const { tenant } = getRequestEvent().locals;
	if (!tenant) error(403, m.common_error_no_organization());
	return { user, ...tenant };
}

/**
 * The signed-in user and their current tenant, or a 401/403. Refuses field engineers (see
 * `isFieldEngineer`), who only use the engineer portal.
 */
export function requireMember() {
	const tenant = requireTenant();
	if (isFieldEngineer(tenant.roles)) error(403, m.common_error_engineers_use_portal());
	return tenant;
}

/**
 * The signed-in user, their current tenant and the engineer record linked to their account there
 * (`engineer.userId`), or a 401/403. Call it first in every remote function of the engineer
 * portal, and scope its queries to `engineer.id` as well as the tenant.
 */
export async function requireEngineer() {
	const tenant = requireTenant();
	const linked = await db.query.engineer.findFirst({
		where: and(eq(engineer.userId, tenant.user.id), inTenant(engineer)),
	});
	if (!linked) error(403, m.common_error_not_linked());
	return { ...tenant, engineer: linked };
}

/**
 * Scopes a query to the current tenant: `.where(and(inTenant(customer), …))`. Every query on a
 * tenant table needs it, also when looking up a record by id (ids are global).
 */
export function inTenant(table: { organizationId: SQLiteColumn }): SQL {
	return eq(table.organizationId, requireTenant().organizationId);
}

/**
 * The current tenant, if it has `moduleId`; otherwise a 404, as if the module's pages and data
 * didn't exist. Call it first in every remote function of an optional module.
 */
export function requireModule(moduleId: ModuleId) {
	const tenant = requireMember();
	if (!tenant.modules.includes(moduleId)) error(404, m.common_error_not_found());
	return tenant;
}

/** The current tenant, if the user has one of `roles` in it; otherwise a 403. */
export function requireRole(...roles: string[]) {
	const tenant = requireMember();
	if (!tenant.roles.some((role) => roles.includes(role))) {
		error(403, m.common_error_no_permission());
	}
	return tenant;
}
