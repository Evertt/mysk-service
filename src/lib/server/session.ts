import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { asc, eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { ModuleId } from "#lib/modules.js";
import { db } from "#lib/server/db/index.js";
import { member, organization, organizationModule } from "#lib/server/db/schema.js";

/** The organization a request works in, with the signed-in user's role there. */
export interface Tenant {
	organizationId: string;
	name: string;
	slug: string;
	/** better-auth's member roles: owner, admin or member (a member may have several). */
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
		memberships.find((m) => m.organizationId === activeOrganizationId) ?? memberships[0];
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
		modules: modules.map((m) => m.id),
	};
}

/**
 * The signed-in user, or a 401. Call it first in every remote function that needs a login: the
 * redirect to /login in `hooks.server.ts` only guards page requests, not remote function calls.
 * Remote functions that touch tenant data use `requireMember()` instead.
 */
export function requireUser() {
	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not signed in");
	return user;
}

/** The signed-in user and their current tenant, or a 401/403. */
export function requireMember() {
	const user = requireUser();
	const { tenant } = getRequestEvent().locals;
	if (!tenant) error(403, "You're not a member of any organization");
	return { user, ...tenant };
}

/**
 * Scopes a query to the current tenant: `.where(and(inTenant(customer), …))`. Every query on a
 * tenant table needs it, also when looking up a record by id (ids are global).
 */
export function inTenant(table: { organizationId: SQLiteColumn }): SQL {
	return eq(table.organizationId, requireMember().organizationId);
}

/**
 * The current tenant, if it has `moduleId`; otherwise a 404, as if the module's pages and data
 * didn't exist. Call it first in every remote function of an optional module.
 */
export function requireModule(moduleId: ModuleId) {
	const tenant = requireMember();
	if (!tenant.modules.includes(moduleId)) error(404, "Not found");
	return tenant;
}

/** The current tenant, if the user has one of `roles` in it; otherwise a 403. */
export function requireRole(...roles: string[]) {
	const tenant = requireMember();
	if (!tenant.roles.some((role) => roles.includes(role))) {
		error(403, "You don't have permission to do this");
	}
	return tenant;
}
