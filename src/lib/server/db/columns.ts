/**
 * Columns that the tables of the core (`schema.ts`) and of the modules
 * (`src/modules/<id>/server/schema.ts`) share.
 */
import { sql } from "drizzle-orm";
import { customType, text } from "drizzle-orm/sqlite-core";

import { organization } from "./auth.schema.ts";

/**
 * The tenant a row belongs to. Every business table has one, except contract coverage, whose
 * customer pins it to a tenant. Queries scope by it with `inTenant()` from
 * `#lib/server/auth/session.ts`.
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

/**
 * A moment, e.g. when an order was created or is scheduled for: a `Temporal.Instant` in the app,
 * whole seconds since 1970 (UTC) in the database, so SQLite's `unixepoch()` can make one.
 */
export const moment = customType<{ data: Temporal.Instant; driverData: number }>({
	dataType: () => "integer",
	toDriver: (instant) => Math.floor(instant.epochMilliseconds / 1000),
	fromDriver: (seconds) => Temporal.Instant.fromEpochMilliseconds(Number(seconds) * 1000),
});

/**
 * A day on the calendar, e.g. a due date or when a contract starts: a `Temporal.PlainDate` in the
 * app, `yyyy-mm-dd` in the database. No time zone: it's the same day for everyone, and days
 * compare and sort as text.
 */
export const day = customType<{ data: Temporal.PlainDate; driverData: string }>({
	dataType: () => "text",
	toDriver: (date) => date.toString(),
	fromDriver: (text) => Temporal.PlainDate.from(text),
});

/** When the row was made, by the database. */
export const createdAt = () =>
	moment("created_at")
		.notNull()
		.default(sql`(unixepoch())`);
