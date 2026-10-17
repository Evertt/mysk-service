/**
 * The spec file's database (its copy of the seeded demo database, see `setup.ts`), read the way
 * the e2e tests read the app's (`src/tests/e2e/db.ts`): `rows()` and `value()` take SQL, so a
 * check doesn't share the code it checks. And switching a tenant's modules off, for the tenant
 * without a module that every tenant of the seed has.
 */
import type { InValue } from "@libsql/client";
import { and, eq } from "drizzle-orm";

import type { ModuleId } from "#lib/modules/ids.ts";
import { demoOrganizations } from "#lib/server/db/demo.ts";
import { db } from "#lib/server/db/index.ts";
import { organizationModule } from "#lib/server/db/schema.ts";

import type { Organization } from "./actors.ts";

/** Runs a query against the file's database and returns its rows. */
export async function rows<T = Record<string, unknown>>(sql: string, args: InValue[] = []) {
	const result = await db.$client.execute({ sql, args });
	return result.rows as unknown as T[];
}

/** The first column of the first row, e.g. of a `select count(*)`. */
export async function value<T = unknown>(sql: string, args: InValue[] = []) {
	const [row] = (await db.$client.execute({ sql, args })).rows;
	return row?.[0] as T;
}

/** The id of a demo organization, e.g. `org-north`, for the SQL of `rows()` and `value()`. */
export const organizationId = (organization: Organization) => demoOrganizations[organization].id;

/**
 * Switches `moduleId` off for `organization` (its row in `organization_module`), and with it the
 * modules that require it, until `work` is done; then on again if it was. The tenant is loaded
 * for each request, so the requests in `work` see it off.
 */
export async function withoutModule<T>(
	organization: Organization,
	moduleId: ModuleId,
	work: () => Promise<T>,
): Promise<T> {
	const id = organizationId(organization);
	const where = and(
		eq(organizationModule.organizationId, id),
		eq(organizationModule.moduleId, moduleId),
	);
	const removed = await db.delete(organizationModule).where(where).returning();
	try {
		return await work();
	} finally {
		if (removed.length) await db.insert(organizationModule).values(removed);
	}
}
