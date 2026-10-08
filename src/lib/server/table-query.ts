/**
 * Server-side tables: a list's search, filters, sorting and page, read from the URL with the same
 * grammar as the table writes (`#lib/components/data-table/url-state.ts`), turned into SQL. The
 * database pages, filters and sorts, so a list never loads more than a page of rows.
 *
 * A table describes how its columns map onto SQL (`ServerTable`); `planTable()` reads the URL's
 * parameters into a plan (`where`, `orderBy`, `limit`, `offset`) that the list's remote query puts
 * on its own `select`, with its own joins (each scoped to the tenant with `inTenant()`), e.g.:
 *
 * ```ts
 * const plan = planTable(ordersTable, params);
 * const rows = await fromOrders({ … }).where(plan.where()).orderBy(...plan.orderBy)
 * 	.limit(plan.limit).offset(plan.offset);
 * const [{ rowCount }] = await fromOrders({ rowCount: count() }).where(plan.where());
 * ```
 */
import { and, inArray, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import * as v from "valibot";

import {
	filterValues,
	parseTableUrl,
	type SearchParams,
	tableUrlKey,
	type TableUrlSpec,
	type TableUrlState,
} from "#lib/components/data-table/url-state.js";

/**
 * The argument of a list's remote queries: the table's URL parameters as a search string (see
 * `serverTableQuery` in `#lib/components/data-table/server-table.ts`).
 */
export const tableParams = v.pipe(v.string(), v.maxLength(4000));

/** What a column of a server-side table sorts and filters by. */
export interface ServerColumn {
	/** What it sorts by, ascending; several to break ties, e.g. manufacturer, then model. */
	sort?: SQLWrapper | readonly SQLWrapper[];
	/** Rows without a value (null) come last in either direction, like `sortUndefined: "last"`. */
	nullsLast?: boolean;
	/** Its `set` filter: keeps the rows with any of the values (from the URL, so check them). */
	filter?: (values: string[]) => SQL | undefined;
}

/** How a list's URL state maps onto SQL. */
export interface ServerTable {
	/**
	 * The table's URL grammar: the same column ids, parameters and defaults as the client's table,
	 * so they read the same URLs.
	 */
	spec: TableUrlSpec;
	/** By column id; columns that aren't here can't be sorted or filtered by. */
	columns: Readonly<Record<string, ServerColumn>>;
	/** What the search box searches: each word must be in one of them, in any case. */
	search: readonly SQLWrapper[];
	/** A unique column (e.g. the id), sorted by last, so rows don't move between pages. */
	tieBreaker: SQLWrapper;
	/** The rows the current user may see, e.g. `() => inTenant(order)`; part of every `where`. */
	scope: () => SQL;
}

/** A list's query, from its URL. */
export interface TablePlan {
	state: TableUrlState;
	/** The state's parameters as one string, the same for the same state (`tableUrlKey`). */
	key: string;
	/**
	 * The scope, the filters and the search; without the filter of `except` (a column id), for the
	 * counts in that column's filter (which shouldn't depend on what's ticked in it).
	 */
	where(except?: string): SQL | undefined;
	orderBy: SQL[];
	limit: number;
	offset: number;
}

/** `like` with `%` and `_` in the text taken literally. */
function contains(expression: SQLWrapper, text: string) {
	const pattern = `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
	return sql`${expression} like ${pattern} escape '\\'`;
}

/** Sorts text case-insensitively, e.g. `sort: nocase(customer.name)`. */
export const nocase = (expression: SQLWrapper) => sql`${expression} collate nocase`;

/**
 * A column's place in a list of values, e.g. a priority's urgency, to sort by in that order
 * rather than alphabetically. Values that aren't listed come last.
 */
export function rank(expression: SQLWrapper, values: readonly string[]) {
	const cases = values.map((value, index) => sql`when ${value} then ${index}`);
	return sql`(case ${expression} ${sql.join(cases, sql` `)} else ${values.length} end)`;
}

/** A filter on a column's own values: keeps the rows with one of them. */
export const oneOf =
	(expression: Parameters<typeof inArray>[0]) =>
	(values: string[]): SQL =>
		inArray(expression, values);

/**
 * A search's condition: each word of `text` is in one of `columns`, in any case (for letters
 * without accents: SQLite's `like`). `undefined` for an empty search.
 */
export function searchMatch(columns: readonly SQLWrapper[], text: string) {
	const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 10);
	if (!words.length || !columns.length) return undefined;
	return and(...words.map((word) => or(...columns.map((column) => contains(column, word)))));
}

/**
 * Reads a list's search, filters, sorting and page from the URL's parameters (a search string
 * like `status=quote&page=2`, or `URLSearchParams`), as the table's `spec` says. What the table
 * doesn't know is ignored; the page size is one the table offers.
 */
export function planTable(table: ServerTable, params: string | SearchParams): TablePlan {
	const search = typeof params === "string" ? new URLSearchParams(params) : params;
	const state = parseTableUrl(search, table.spec);
	const { pageIndex, pageSize } = state.pagination;

	const where = (except?: string) => {
		const filters = Object.entries(table.columns).flatMap(([id, column]) => {
			const values = id !== except && column.filter && filterValues(state, id);
			const condition = values ? column.filter!(values) : undefined;
			return condition ? [condition] : [];
		});
		return and(table.scope(), ...filters, searchMatch(table.search, state.globalFilter));
	};

	const orderBy = state.sorting.flatMap(({ id, desc }) => {
		const column = table.columns[id];
		if (!column?.sort) return [];
		const expressions = Array.isArray(column.sort) ? column.sort : [column.sort as SQLWrapper];
		const direction = sql.raw(desc ? "desc" : "asc");
		const nulls = sql.raw(column.nullsLast ? " nulls last" : "");
		return expressions.map((expression) => sql`${expression} ${direction}${nulls}`);
	});
	orderBy.push(sql`${table.tieBreaker} asc`);

	return {
		state,
		key: tableUrlKey(state, table.spec).replace(/^\?/, ""),
		where,
		orderBy,
		limit: pageSize,
		offset: pageIndex * pageSize,
	};
}

/**
 * How many rows have each value of some columns, for the counts in their filters: the rows that
 * match the search and the other filters, as in TanStack's faceting. `count` counts the list's
 * rows that match `where` by the value of `by`, as `{ value, count }` (e.g. a `select` from the
 * list's tables `where(where).groupBy(by)`). Returns the counts by column id and value.
 */
export async function facetCounts<Id extends string>(
	plan: TablePlan,
	columns: Readonly<Record<Id, SQLWrapper>>,
	count: (
		where: SQL | undefined,
		by: SQLWrapper,
	) => PromiseLike<{ value: unknown; count: number }[]>,
): Promise<Record<Id, Record<string, number>>> {
	const ids = Object.keys(columns) as Id[];
	const counted = await Promise.all(ids.map((id) => count(plan.where(id), columns[id])));
	return Object.fromEntries(
		ids.map((id, index) => [
			id,
			Object.fromEntries(counted[index].map((row) => [String(row.value), row.count])),
		]),
	) as Record<Id, Record<string, number>>;
}
