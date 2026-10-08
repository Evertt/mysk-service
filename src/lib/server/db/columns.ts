/**
 * Columns that the tables of the core (`schema.ts`) and of the modules
 * (`src/modules/<id>/server/schema.ts`) share.
 */
import { sql } from "drizzle-orm";
import { integer, text } from "drizzle-orm/sqlite-core";

import { organization } from "./auth.schema.ts";

/**
 * The tenant a row belongs to. Every business table has one, except contract coverage, whose
 * customer pins it to a tenant. Queries scope by it with `inTenant()` from
 * `#lib/server/session.ts`.
 *
 * References between tenant tables are composite foreign keys that include the tenant (e.g.
 * `(organization_id, customer_id)` → `customer (organization_id, id)`), so the database refuses a
 * reference to another tenant's row, and relations and joins match on both columns. Each table
 * that is referenced this way has a unique index on `(organization_id, id)` for them to point at.
 */
export const organizationId = () =>
	text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" });

/** When the row was made, by the database. */
export const createdAt = () =>
	integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`);
