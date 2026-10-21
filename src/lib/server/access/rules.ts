/**
 * A subject type's access rules: which of its records each audience may read, and change, as a
 * condition on the type's table. The condition is the rule: `readable()` checks a batch of ids
 * against it, and `visible()` hands it out for a list's `scope`, a join or a subquery, so one
 * statement decides both "may this contact read order 12?" and "which orders does the portal list?".
 * Makers cover every type, so no entry is written by hand:
 *
 * - `rows(table, idColumn, byAudience, options?)`: a type with a row of its own (`order`, `customer`);
 * - `partOf(parentType, table, parentColumn, narrowedBy?)`: a part, whose rule is its parent's (`order_line`);
 * - `tenantWide(byAudience, options?)`: a type without a row (`module`, `order_type`, `*_settings`).
 *
 * An audience has an entry for a type, or it doesn't read it: deny by default. An entry is `true`
 * (every record of the tenant), `"manager"` (the same, for owners and admins; the office only), or
 * a function of the viewer that answers the SQL condition on the type's table (`undefined`: none),
 * built from the audience scopes that exist (`engineerOrders()`, `customerOrders()`, …). The system,
 * which works across the tenant, reads and changes everything unless an entry says otherwise.
 */
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";

import type { Audience, Viewer } from "./viewer.ts";

/** A condition on a type's table, or `"all"`: every record of the tenant, no query needed. */
export type Condition = SQL | "all";

/** The rule of a subject type, by its name: what a part asks of its parent. */
export type Rules = (type: string) => AccessRule | undefined;

/** The table and id column a record of a type is kept in. */
interface RowOf {
	table: SQLiteTable;
	idColumn: SQLiteColumn;
}

/** A subject type's rules (see the makers below). */
export interface AccessRule {
	/** The records `viewer` may read, as a condition on the type's table; `undefined`: none. */
	read(viewer: Viewer, rules: Rules): Promise<Condition | undefined>;
	/** The same for a change. */
	change(viewer: Viewer, rules: Rules): Promise<Condition | undefined>;
	/**
	 * Of `ids`, those that exist in the tenant and meet `where`: one statement. `"all"` is every
	 * record of the tenant.
	 */
	check(ids: readonly string[], where: Condition): Promise<Set<string>>;
	/** `where` as a condition on the type's table, for a list's `scope` or a join; `"all"` too. */
	scope(where: Condition): SQL;
	/** Where its records are kept, for the rules of its parts; none for a type without a row. */
	row?: RowOf;
}

type Of<A extends Audience> = Extract<Viewer, { audience: A }>;

/** What one audience may reach of a type. */
type Entry<A extends Audience, Extra = never> =
	| true
	| Extra
	| ((viewer: Of<A>) => SQL | undefined | Promise<SQL | undefined>);

/** The audiences' entries; an audience without one reads nothing (the system excepted, see above). */
export interface ByAudience {
	office?: Entry<"office", "manager">;
	engineer?: Entry<"engineer">;
	customer?: Entry<"customer">;
	system?: Entry<"system">;
}

/**
 * The entries for a change: `"manager"` is the settings' (only owners and admins, and the system);
 * else the audiences that may change what they read, by their own entries. Without it the office
 * changes what it reads, and the portals change nothing.
 */
export interface Options {
	change?: "manager" | ByAudience;
}

const everyone = { system: true } as const satisfies ByAudience;

async function entryOf(
	entry: ByAudience[Audience],
	viewer: Viewer,
): Promise<Condition | undefined> {
	if (!entry) return undefined;
	if (entry === true) return "all";
	if (entry === "manager")
		return viewer.audience === "office" && viewer.manager ? "all" : undefined;
	return (entry as (viewer: Viewer) => SQL | undefined | Promise<SQL | undefined>)(viewer);
}

/** The condition `by` gives `viewer`'s audience. */
function conditionOf(by: ByAudience, viewer: Viewer) {
	return entryOf(by[viewer.audience], viewer);
}

/** What changes: `options.change`, else the office's own read entry and the system's. */
function changeEntries(read: ByAudience, { change }: Options): ByAudience {
	if (change === "manager") return { ...everyone, office: "manager" };
	if (change) return { ...everyone, ...change };
	return { ...everyone, office: read.office };
}

/** The ids of `column`'s type: numbers for an integer column, which a subject's id carries as text. */
function keysOf(column: SQLiteColumn, ids: readonly string[]): (string | number)[] {
	if (column.dataType !== "number") return [...ids];
	return ids.map(Number).filter(Number.isInteger);
}

/**
 * A type with a row of its own: `idColumn` identifies its records in `table`. Its rules are
 * conditions on `table`; `inTenant(table)` is added to every check.
 */
export function rows(
	table: SQLiteTable & { organizationId: SQLiteColumn },
	idColumn: SQLiteColumn,
	byAudience: ByAudience,
	options: Options = {},
): AccessRule {
	const reading = { ...everyone, ...byAudience };
	const changing = changeEntries(reading, options);
	const scope = (where: Condition) => (where === "all" ? inTenant(table) : where);
	return {
		read: async (viewer) => conditionOf(reading, viewer),
		change: async (viewer) => conditionOf(changing, viewer),
		scope,
		row: { table, idColumn },
		async check(ids, where) {
			const keys = keysOf(idColumn, ids);
			if (!keys.length) return new Set();
			const found = await db
				.select({ id: idColumn })
				.from(table)
				.where(and(inList(idColumn, keys), inTenant(table), scope(where)));
			return new Set(found.map((row) => String(row.id)));
		},
	};
}

/**
 * What an audience reads or changes of a part besides what its parent gives: a condition on the
 * part's own table (a customer sees an order's checklists once they're completed).
 */
export type NarrowedBy = { [A in Audience]?: (viewer: Of<A>) => SQL };

/**
 * A part of a record of `parentType` (an order's line, an invoice's line): `parentColumn` of
 * `table` is its parent's id, and its rules are its parent's, through `exists`, `narrowedBy` an
 * audience's own condition on the part. A parent the tenant has no rule for (its module is off)
 * leaves the part unreadable.
 */
export function partOf(
	parentType: string,
	table: SQLiteTable & { organizationId: SQLiteColumn; id: SQLiteColumn },
	parentColumn: SQLiteColumn,
	narrowedBy: NarrowedBy = {},
): AccessRule {
	const through =
		(which: "read" | "change") =>
		async (viewer: Viewer, rules: Rules): Promise<Condition | undefined> => {
			const parent = rules(parentType);
			if (!parent?.row) return undefined;
			const where = await parent[which](viewer, rules);
			if (!where) return undefined;
			const narrow = (narrowedBy[viewer.audience] as ((viewer: Viewer) => SQL) | undefined)?.(
				viewer,
			);
			if (where === "all") return narrow ? and(inTenant(table), narrow)! : "all";
			const { table: parentTable, idColumn } = parent.row;
			return and(
				inTenant(table),
				narrow,
				sql`exists (select 1 from ${parentTable} where ${and(eq(idColumn, parentColumn), where)})`,
			)!;
		};
	return {
		read: through("read"),
		change: through("change"),
		scope: (where) => (where === "all" ? inTenant(table) : where),
		row: { table, idColumn: table.id },
		async check(ids, where) {
			const keys = keysOf(table.id, ids);
			if (!keys.length) return new Set();
			const found = await db
				.select({ id: table.id })
				.from(table)
				.where(and(inList(table.id, keys), inTenant(table), where === "all" ? undefined : where));
			return new Set(found.map((row) => String(row.id)));
		},
	};
}

/**
 * A type without a row (`module`, `order_type`, `*_settings`, `simulation`): the answer is the
 * audience's yes or no, for any id. Its entries are `true` or `"manager"` only.
 */
export function tenantWide(
	byAudience: { [A in Audience]?: true | (A extends "office" ? "manager" : never) },
	options: Options = {},
): AccessRule {
	const reading: ByAudience = { ...everyone, ...byAudience };
	const changing = changeEntries(reading, options);
	return {
		read: async (viewer) => conditionOf(reading, viewer),
		change: async (viewer) => conditionOf(changing, viewer),
		scope: () => sql`1`,
		check: async (ids) => new Set(ids),
	};
}
