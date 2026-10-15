import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, asc, eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import { isFieldEngineer, managerRoles, parseRoles } from "#lib/auth/index.ts";
import { effectiveModules } from "#lib/modules/graph.ts";
import type { ModuleId } from "#lib/modules/ids.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { engineer, member, organization, organizationModule } from "#lib/server/db/schema.ts";

import { systemTenant, systemUser } from "./system.ts";

/** The organization a request works in, with the signed-in user's role there. */
export interface Tenant {
	organizationId: string;
	name: string;
	slug: string;
	/** The member's roles, see `memberRoles` in `#lib/auth/roles.ts` (a member may have several). */
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
		roles: parseRoles(current.role),
		// A row for a module that's no longer there (removed from the app) does nothing, and neither
		// does one whose requirements are off; the always-on modules need no row.
		modules: effectiveModules(modules.map((row) => row.id)),
	};
}

/**
 * The signed-in user, or a 401. The gate of `forUsers` in `#lib/server/remote-functions.ts`: the redirect to
 * /login in `hooks.server.ts` only guards page requests, not remote function calls.
 */
export function requireUser() {
	// The daily jobs, as the system (see `asSystem()`).
	if (systemTenant()) return systemUser;
	const { user } = getRequestEvent().locals;
	if (!user) error(401, m.common_error_not_signed_in());
	return user;
}

/**
 * The signed-in user and their current tenant, whatever their role there, or a 401/403. For code
 * that both the office and the engineer portal use (`inTenant`, the stock ledger); remote functions
 * are gated by `forMembers` or `forEngineers` (`#lib/server/remote-functions.ts`) instead.
 */
export function requireTenant() {
	const system = systemTenant();
	if (system) return { user: systemUser, ...system };
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

/** The engineer lookups of the requests in progress, so the gate and the handler share one. */
const engineers = new WeakMap<object, ReturnType<typeof findEngineer>>();

async function findEngineer() {
	const tenant = requireTenant();
	const linked = await db.query.engineer.findFirst({
		where: and(eq(engineer.userId, tenant.user.id), inTenant(engineer)),
	});
	if (!linked) error(403, m.common_error_not_linked());
	return { ...tenant, engineer: linked };
}

/**
 * The signed-in user, their current tenant and the engineer record linked to their account there
 * (`engineer.userId`), or a 401/403. The gate of `forEngineers` in `#lib/server/remote-functions.ts`, the
 * engineer portal's remote functions, which scope their queries to `engineer.id` as well as the
 * tenant. Looked up once per request.
 */
export function requireEngineer() {
	const event = getRequestEvent();
	let found = engineers.get(event);
	if (!found) engineers.set(event, (found = findEngineer()));
	return found;
}

/**
 * Scopes a query to the current tenant: `.where(and(inTenant(customer), …))`. Every query on a
 * tenant table needs it, also when looking up a record by id (ids are global).
 */
export function inTenant(table: { organizationId: SQLiteColumn }): SQL {
	return eq(table.organizationId, requireTenant().organizationId);
}

/** A table of tenant records: with an `id` and the `organizationId` that `inTenant()` compares. */
export interface TenantTable {
	id: SQLiteColumn;
	organizationId: SQLiteColumn;
}

/**
 * `table.id = id` in the current tenant: the way to look a record up by an id from the client
 * (ids are global). An `eq(table.id, id)` without `inTenant()` stands out in review.
 */
export const idInTenant = (table: TenantTable, id: number): SQL =>
	and(eq(table.id, id), inTenant(table))!;

/** `table.id in ids` in the current tenant: the way to load the records of ids from the client. */
export const idsInTenant = (table: TenantTable, ids: number[]): SQL =>
	and(inList(table.id, ids), inTenant(table))!;

/**
 * The arguments of a join on `table` through `foreignKey`, kept in the tenant (ids are global):
 * `.leftJoin(...tenantJoin(engineer, order.engineerId))`.
 */
export const tenantJoin = <T extends TenantTable>(table: T, foreignKey: SQLiteColumn) =>
	[table, and(eq(foreignKey, table.id), inTenant(table))!] as const;

/**
 * The current tenant, if it has `moduleId`; otherwise a 404, as if the module's pages and data
 * didn't exist. The gate of a module's remote functions (`moduleRemote()` in
 * `#lib/server/remote-functions.ts`) and endpoints. Office members only, unless `anyRole` (the
 * engineer portal's, whose own gate follows).
 */
export function requireModule(moduleId: ModuleId, { anyRole = false } = {}) {
	const tenant = anyRole ? requireTenant() : requireMember();
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

/** The current tenant, if the user is an owner or an admin (`managerRoles`) in it; otherwise a 403. */
export const requireManager = () => requireRole(...managerRoles);

// --- Inside a gated remote function ----------------------------------------------------------
//
// A remote function's gate (`#lib/server/remote-functions.ts`) has admitted the request before its handler
// runs; these read what the gate checked, without checking a role again. They still refuse (a
// 401/403) when there's no user or tenant, so calling one where no gate ran is never unsafe.

/** The signed-in user, in a remote function gated by `forUsers` (or any stricter gate). */
export const currentUser = () => requireUser();

/**
 * The signed-in user and their tenant (`organizationId`, `roles`, `modules`, …), in a remote
 * function gated by `forMembers`, `forManagers`, `forEngineers`, `forAnyRole` or a module's set.
 */
export const currentTenant = () => requireTenant();

/** The engineer record of the signed-in user, in a remote function gated by `forEngineers`. */
export const currentEngineer = async () => (await requireEngineer()).engineer;
