// The app's own tables, around the tenants' business data: which modules a tenant has and their
// simulations, integration tokens, saved views and table memory, the activity log and the
// notifications read, and the platform's bug reports.
import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { ReportContext } from "#lib/bug-reports/report.ts";
import type { ActivityAction } from "#lib/models.ts";
import { simulationSpeeds } from "#lib/simulation/extensions.ts";

import { organization, user } from "../auth.schema.ts";
import { createdAt, moment, momentMs, tenantRef, tenantTable } from "../columns.ts";

// --- Tenants and modules --------------------------------------------------------------------------

/** The optional modules (see `#lib/modules/manifests.ts`) a tenant has, e.g. through their subscription. */
export const organizationModule = tenantTable(
	"organization_module",
	{
		moduleId: text("module_id").notNull(),
		enabledAt: createdAt(),
	},
	(table) => [primaryKey({ columns: [table.organizationId, table.moduleId] })],
	{ key: "own" },
);

/**
 * A module's simulation for a demo (`#lib/server/simulation.ts`): a row means the organization is
 * offered one for that module (the seed gives SHLTR its docks' and energy's; real tenants never
 * have one). While it runs, the runner has the module move its data on over each interval of real
 * time since `last_tick_at`, `speed` times as busy.
 */
export const simulation = tenantTable(
	"simulation",
	{
		moduleId: text("module_id").notNull(),
		running: integer("running", { mode: "boolean" }).notNull().default(true),
		/** One of `simulationSpeeds` (`#lib/simulation/extensions.ts`). */
		speed: integer("speed").notNull().default(1),
		/** Up to when the simulation has been ticked: the next tick covers what came after. */
		lastTickAt: moment("last_tick_at")
			.notNull()
			.default(sql`(unixepoch())`),
		/** When it was last (re)started from its starting states. */
		startedAt: moment("started_at")
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.moduleId] }),
		check("simulation_speed", sql.raw(`speed in (${simulationSpeeds.join(", ")})`)),
	],
	{ key: "own" },
);

/**
 * A token a system outside the app (e.g. the Salvo dock hardware's feed) posts to a module's
 * integration endpoints with (its `(api)` routes, see `#lib/server/auth/integrations.ts`): it says
 * which tenant the data is for. Managers make and revoke them on the module's settings page; the
 * token itself is shown once and never stored, only its SHA-256 hash and its first characters (to
 * tell tokens apart). A revoked token stays, so the log can name it.
 */
export const integrationToken = tenantTable(
	"integration_token",
	{
		/** The module whose endpoints it may post to. */
		moduleId: text("module_id").notNull(),
		/** What it's for, e.g. "Salvo Barneveld". */
		name: text("name").notNull(),
		/** The token's SHA-256, in hex. */
		tokenHash: text("token_hash").notNull(),
		/** The token's first characters, e.g. `fwi_3f9a`. */
		prefix: text("prefix").notNull(),
		/** Who made it; none once their account is gone. */
		createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
		/** When it was last used, to the minute. */
		lastUsedAt: moment("last_used_at"),
		revokedAt: moment("revoked_at"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("integration_token_hash").on(table.tokenHash),
		index("integration_token_organization_module").on(table.organizationId, table.moduleId),
		index("integration_token_created_by").on(table.createdBy),
	],
);

// --- Saved views ----------------------------------------------------------------------------------

/** Which of a table's columns are shown, by id (see `#lib/components/data-table/column-visibility.ts`). */
type ColumnVisibility = Record<string, boolean>;

/**
 * A data table's search, filters, sorting, page size and columns saved under a name (see
 * `#lib/components/data-table/views.ts`), to get back to in one click. Personal to the user who
 * saved it, unless an owner or admin shares it with the whole organization. It references no
 * business records: only the tenant and its creator (deleted with either), so a member who leaves
 * keeps their personal views out of sight and their shared ones stay with the organization.
 */
export const savedView = tenantTable(
	"saved_view",
	{
		/** Who saved it, and who may change it (besides owners and admins, if it's shared). */
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** The table, e.g. `/(app)/orders`: its route, plus its URL prefix if it has one. */
		tableKey: text("table_key").notNull(),
		name: text("name").notNull(),
		/** The table's parameters as its URL has them, e.g. `?status=quote&sort=-priority`. */
		query: text("query").notNull(),
		/**
		 * Which of the table's hideable columns it shows, as they were when it was saved; `null` for a
		 * view saved before views had columns, which leaves the columns as they are.
		 */
		columns: text("columns", { mode: "json" }).$type<ColumnVisibility>(),
		/** Whether every member of the organization sees it. */
		shared: integer("shared", { mode: "boolean" }).notNull().default(false),
		createdAt: createdAt(),
		updatedAt: moment("updated_at")
			.notNull()
			.default(sql`(unixepoch())`)
			.$onUpdate(() => Temporal.Now.instant()),
	},
	(table) => [
		// A user's views of a table have different names. The user first: also the key to `user`.
		uniqueIndex("saved_view_user_table_name").on(
			table.userId,
			table.organizationId,
			table.tableKey,
			table.name,
		),
		index("saved_view_table").on(table.organizationId, table.tableKey),
	],
);

/**
 * What the app remembers of a user's data table (see
 * `#lib/components/data-table/table-memory.svelte.ts`): the columns they show, and where they left
 * it (its parameters and the saved view they had open), to come back to. One row per user and
 * table, only while there's something to remember. Like a personal view, it concerns nobody else.
 */
export const tableMemory = tenantTable(
	"table_memory",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** The table, as for saved views: `/(app)/orders`. */
		tableKey: text("table_key").notNull(),
		/** Which of the table's hideable columns they show; `null` for the table's defaults. */
		columns: text("columns", { mode: "json" }).$type<ColumnVisibility>(),
		/** The table's parameters as its URL had them last, without the page: `?status=quote`. */
		query: text("query").notNull().default(""),
		/**
		 * The saved view they had open, if any (with `query` as they left it, which may have changes
		 * they didn't save in it). Not a foreign key: a view that's gone (or no longer shared) is
		 * simply not found.
		 */
		viewId: integer("view_id"),
		updatedAt: moment("updated_at")
			.notNull()
			.default(sql`(unixepoch())`)
			.$onUpdate(() => Temporal.Now.instant()),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.userId, table.tableKey] }),
		index("table_memory_user").on(table.userId),
	],
	{ key: "own" },
);

// --- Activity log ---------------------------------------------------------------------------------

/** An update's changed fields with their values before and after, e.g. `{ status: ["quote", "scheduled"] }`. */
export type ActivityChanges = Record<string, [unknown, unknown]>;

/**
 * Who did what to which record, and when: one row per change, written by `recordActivity()` in
 * `#lib/server/activity/log.ts` in the same transaction as the change. The subject (and the optional
 * parent, e.g. the order of an order line) is a type and id without a foreign key, so it can be
 * any table's, a module's included, and outlives the record: its label and the user's name are
 * kept as they were. Rows are never changed afterwards. Unique on `(organization_id, id)`, for
 * `notification_seen`'s composite key.
 */
export const activity = tenantTable(
	"activity",
	{
		/** Cleared when the user is deleted; `userName` keeps who it was. */
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		userName: text("user_name").notNull(),
		action: text("action").$type<ActivityAction>().notNull(),
		/** E.g. `order`, see `subjectTypes` in `#lib/activity/subjects.ts`. */
		subjectType: text("subject_type").notNull(),
		/** The record's id, as text (the auth tables' ids are text). */
		subjectId: text("subject_id").notNull(),
		/** How the record read at the time, e.g. its order number or customer code. */
		subjectLabel: text("subject_label").notNull(),
		parentType: text("parent_type"),
		parentId: text("parent_id"),
		parentLabel: text("parent_label"),
		/** The fields an update changed, see `ActivityChanges`. */
		changes: text("changes", { mode: "json" }).$type<ActivityChanges>(),
		/** Anything else worth saying, e.g. the note with received stock. */
		note: text("note"),
		createdAt: createdAt(),
	},
	(table) => [
		index("activity_subject").on(table.organizationId, table.subjectType, table.subjectId),
		index("activity_parent").on(table.organizationId, table.parentType, table.parentId),
		index("activity_user").on(table.userId),
		// The tenant's recent entries (the notifications' window): without it, a tray with fewer
		// matches than it shows walks the tenant's whole history by id.
		index("activity_organization_created").on(table.organizationId, table.createdAt),
	],
	{ referenced: true },
);

// --- Notifications --------------------------------------------------------------------------------

/**
 * How far a user has read their notifications in an organization: the newest activity entry their
 * tray showed when they last opened it (`#lib/server/notifications/`). Notifications themselves
 * aren't stored: they're the activity entries that match a rule, newer than this. An entry's id
 * rather than a time, as ids only grow: no clock skew, and nothing lost within a second. The entry
 * is the tenant's (the composite key), so a tampered id can't point at another tenant's.
 */
export const notificationSeen = tenantTable(
	"notification_seen",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		lastSeenActivityId: integer("last_seen_activity_id").notNull(),
		updatedAt: moment("updated_at")
			.notNull()
			.default(sql`(unixepoch())`)
			.$onUpdate(() => Temporal.Now.instant()),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.userId] }),
		index("notification_seen_user").on(table.userId),
		index("notification_seen_activity").on(table.organizationId, table.lastSeenActivityId),
		tenantRef(table, table.lastSeenActivityId, activity, { onDelete: "cascade" }),
	],
	{ key: "own" },
);

// --- Platform -------------------------------------------------------------------------------------
// The app's own records about itself, not a tenant's business data.

/**
 * A bug report a user recorded with the record button in the headers (`#lib/bug-reports/`): who,
 * where and when, their note, and where the recording is (`objectKey`, in the R2 bucket or the
 * folder of `#lib/server/bug-reports/storage.ts`). The platform's, not the tenant's: the
 * organization and the user only say who reported it (emptied when either is deleted), the
 * reporters can't read it at all, and the developers read it across tenants (`forDevelopers`). So
 * it isn't scoped with `inTenant()`, and isn't logged to the activity log: it changes none of the
 * tenant's records.
 */
export const bugReport = sqliteTable(
	"bug_report",
	{
		/** A random UUID: the replay page's URL, which says nothing about how many there are. */
		id: text("id").primaryKey(),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		/** Who reported it, as they were named then. */
		userName: text("user_name").notNull(),
		/** The page the recording started on, and its route id. */
		url: text("url").notNull(),
		routeId: text("route_id"),
		/** What they wrote when they stopped; empty if nothing. */
		note: text("note").notNull().default(""),
		userAgent: text("user_agent").notNull(),
		/** The app's version (`version` of `$app/env`) the recording was made in. */
		appVersion: text("app_version").notNull(),
		/** The rest of what was known when it started (`ReportContext`, `#lib/bug-reports/report.ts`). */
		context: text("context", { mode: "json" }).$type<ReportContext>().notNull(),
		startedAt: momentMs("started_at").notNull(),
		durationMs: integer("duration_ms").notNull(),
		/** The recording's size, gzipped, in bytes. */
		size: integer("size").notNull(),
		/** The recording's key in the store: `<year>/<month>/<id>.json.gz`. */
		objectKey: text("object_key").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		index("bug_report_created").on(table.createdAt),
		index("bug_report_organization").on(table.organizationId),
		index("bug_report_user").on(table.userId),
	],
);
