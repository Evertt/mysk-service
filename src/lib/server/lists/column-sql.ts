/**
 * A module column's SQL (see `#lib/components/data-table/module-columns.ts`): a module's
 * `server/columns/<point id>.ts` gives each of its columns' SQL with `columnSql()`, and
 * `scripts/modules.ts` lists them in `columns.gen.ts`, which `withModuleColumns()`
 * (`./module-columns.ts`) reads. The rows' query of a list with module columns adds the page's
 * values with `moduleValues()`, and its filters' counts with `moduleFacets()`.
 *
 * Kept apart from `withModuleColumns()`, which imports the registry, which imports the modules'
 * files, which import `columnSql()` from here: in one file that would be a cycle.
 */
import { and, inArray, type SQL, sql, type SQLWrapper } from "drizzle-orm";

import type { ModuleListColumn } from "#lib/components/data-table/module-columns.ts";
import type { ListColumnsPoint } from "#lib/extensions/define.ts";

import type { ListSql } from "./plan.ts";
/** A module column's SQL, over the list's joined tables (`ListSql.from`), tenant-scoped. */
interface ColumnSqlParts<Filter = any> {
	/** What the column shows: the cell's `value`. */
	value: SQLWrapper;
	/** What it sorts by, ascending, if the column sorts. */
	sort?: SQLWrapper | readonly SQLWrapper[];
	/** Rows without a value (null) come last in either direction. */
	nullsLast?: boolean;
	/** Keeps the rows with any of the values, if the column filters. */
	filter?: (values: Filter[]) => SQL | undefined;
	/**
	 * The filter value a row counts under in the filter's options, or null for `none` (e.g. a
	 * `case` that buckets a date into `overdue` and `soon`); without it the options count nothing.
	 */
	facet?: SQLWrapper;
}

/** A module column with its SQL, built per request (`inTenant()` reads the request). */
export interface ColumnSql<Value = any, Filter = any> {
	column: ModuleListColumn<Value, Filter>;
	sql: () => ColumnSqlParts<Filter>;
}

/**
 * A module column's SQL (the default export of `server/columns/<point id>.ts` lists them), built
 * by `parts` for each request, typed by the column it's for: `filter` gets that column's values.
 */
export function columnSql<Value, Filter>(
	column: ModuleListColumn<Value, Filter>,
	parts: () => ColumnSqlParts<Filter>,
): ColumnSql<Value, Filter> {
	return { column, sql: parts };
}

/** A module's columns' SQL for a list, as `columns.gen.ts` lists them. */
export interface ColumnSqlContribution {
	module: string;
	point: ListColumnsPoint;
	columns: readonly ColumnSql[];
}

/**
 * The module columns' values of the rows with `ids` (a page of the list), by row id and column
 * id: one query, and none when the list has no module columns.
 */
export async function moduleValues<C>(
	listSql: ListSql<C>,
	ids: readonly number[],
): Promise<Map<number, Record<string, unknown>>> {
	const columns = Object.entries(listSql.modules ?? {});
	if (!columns.length || !ids.length) return new Map();
	// By position: a column's id isn't a name drizzle needs to know.
	const fields = Object.fromEntries(
		columns.map(([, { value }], index) => [`v${index}`, value as SQL]),
	);
	const rows = (await listSql
		.from({ id: sql<number>`${listSql.id}`, ...fields })
		.where(and(listSql.scope(), inArray(listSql.id as SQL, [...ids])))) as ({
		id: number;
	} & Record<string, unknown>)[];
	return new Map(
		rows.map((row) => [
			row.id,
			Object.fromEntries(columns.map(([id], index) => [id, row[`v${index}`]])),
		]),
	);
}

/** What the rows count under in the module columns' filters, for `plan.facets()`, by column id. */
export function moduleFacets<C>(listSql: ListSql<C>): Record<string, SQLWrapper> {
	return Object.fromEntries(
		Object.entries(listSql.modules ?? {}).flatMap(([id, { facet }]) =>
			facet ? [[id, facet]] : [],
		),
	);
}
