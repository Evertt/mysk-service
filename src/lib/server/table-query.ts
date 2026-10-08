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
 *
 * Grouped (`?group=status`, see `#lib/components/data-table/grouping.ts`), the rows are sorted by
 * the group first, and the plan fetches one row more on either side of the page: `plan.page()`
 * splits them off, for the table to tell whether the page's first and last groups go on beyond it,
 * and `groupCounts()` counts each group's rows on every page.
 */
import { and, inArray, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import * as v from "valibot";

import { groupKey, type PageGroups } from "#lib/components/data-table/grouping.js";
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
	/**
	 * What its rows are grouped by, if it's groupable: the value the table groups the rows by (its
	 * `getGroupingValue`, else its value), e.g. a customer's code where the column shows its name.
	 * Rows are sorted by `sort` first (if any), then by this, so a group's rows come together.
	 */
	group?: SQLWrapper;
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
	/** The rows to fetch: the page's, plus the row before and after it when grouped. */
	limit: number;
	offset: number;
	/** The column the rows are grouped by, and its value in SQL (`ServerColumn.group`). */
	group?: { id: string; value: SQLWrapper };
	/**
	 * The fetched rows (`limit` from `offset`, in order) split into the page's and, when grouped,
	 * the rows just before and after it, if there are any.
	 */
	page<Row>(fetched: Row[]): { rows: Row[]; previous?: Row; next?: Row };
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

	const order = (column: ServerColumn, desc: boolean, expressions = sortOf(column)) => {
		const direction = sql.raw(desc ? "desc" : "asc");
		const nulls = sql.raw(column.nullsLast ? " nulls last" : "");
		return expressions.map((expression) => sql`${expression} ${direction}${nulls}`);
	};
	const groupId = state.grouping.find((id) => table.columns[id]?.group);
	const groupColumn = groupId === undefined ? undefined : table.columns[groupId];
	// By the group first (descending if sorted so), as the table's `sortGroupsFirst` does.
	const groupDesc = state.sorting.find((sort) => sort.id === groupId)?.desc ?? false;
	const orderBy = groupColumn
		? order(groupColumn, groupDesc, [...sortOf(groupColumn), groupColumn.group!])
		: [];
	for (const { id, desc } of state.sorting) {
		const column = table.columns[id];
		if (id !== groupId && column?.sort) orderBy.push(...order(column, desc));
	}
	orderBy.push(sql`${table.tieBreaker} asc`);

	const offset = pageIndex * pageSize;
	// When grouped, one more on either side.
	const before = groupColumn && offset > 0 ? 1 : 0;
	const after = groupColumn ? 1 : 0;
	return {
		state,
		key: tableUrlKey(state, table.spec).replace(/^\?/, ""),
		where,
		orderBy,
		limit: pageSize + before + after,
		offset: offset - before,
		group: groupColumn && { id: groupId!, value: groupColumn.group! },
		page<Row>(fetched: Row[]) {
			if (!groupColumn) return { rows: fetched };
			return {
				rows: fetched.slice(before, before + pageSize),
				previous: before ? fetched[0] : undefined,
				next: fetched[before + pageSize],
			};
		},
	};
}

/** What a column sorts by, ascending. */
const sortOf = (column: ServerColumn): readonly SQLWrapper[] =>
	column.sort === undefined
		? []
		: Array.isArray(column.sort)
			? column.sort
			: [column.sort as SQLWrapper];

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

/**
 * When the plan is grouped, how many rows each group has (by `groupKey`), among those matching
 * the search and the filters: for the group rows' counts. `count` is as for `facetCounts`.
 */
export async function groupCounts(
	plan: TablePlan,
	count: (
		where: SQL | undefined,
		by: SQLWrapper,
	) => PromiseLike<{ value: unknown; count: number }[]>,
): Promise<Record<string, number> | undefined> {
	if (!plan.group) return undefined;
	const counted = await count(plan.where(), plan.group.value);
	const counts: Record<string, number> = {};
	for (const row of counted) {
		const key = groupKey(row.value);
		counts[key] = (counts[key] ?? 0) + row.count;
	}
	return counts;
}

/**
 * What a grouped list's query tells about its page's groups (`PageGroups`, for
 * `<table.Table groups>`): `counts` from `groupCounts()`, the rows around the page from
 * `plan.page()`; nothing when it isn't grouped.
 */
export function pageGroupsOf<Row>(
	counts: Record<string, number> | undefined,
	page: { previous?: Row; next?: Row },
): PageGroups<Row> | undefined {
	return counts && { counts, previous: page.previous, next: page.next };
}
