/**
 * Server-side lists: a list's search, filters, sorting and page, turned into SQL. The database
 * pages, filters and sorts, so a list never loads more than a page of rows.
 *
 * A list is defined once (`defineList()` in `#lib/components/data-table/list-definition.ts`: its
 * columns, what each sorts, groups and filters by, and its filter values). Its remote query takes
 * the typed query (`ListQuery`) that definition makes, and `planList()` plans it, with the SQL for
 * each column (`ListSql`, checked against the definition) and one base query that owns the joins:
 *
 * ```ts
 * const plan = planList(ordersSql(), query);
 * const rows = await plan.paged(withOrderJoins(db.select({ … }).from(order).$dynamic()));
 * const total = await plan.count();
 * const facets = await plan.facets({ status: order.status });
 * ```
 *
 * `ListSql` is built per request (a function), as `inTenant()` reads the request. The orders list
 * (`src/routes/(app)/orders/order-list.server.ts`) is the example.
 *
 * Grouped (see `#lib/components/data-table/grouping.ts`), the rows are sorted by the group first,
 * and the plan fetches one row more on either side of the page: `plan.page()` splits them off, for
 * the table to tell whether the page's first and last groups go on beyond it, and `groupCounts()`
 * counts each group's rows on every page.
 */
import { error } from "@sveltejs/kit";
import {
	and,
	count as countRows,
	inArray,
	isNull,
	or,
	sql,
	type SQL,
	type SQLWrapper,
} from "drizzle-orm";
import type { SelectedFields, SQLiteSelect } from "drizzle-orm/sqlite-core";
import * as v from "valibot";

import { groupKey, type PageGroups } from "#lib/components/data-table/grouping.ts";
import type {
	FilterId,
	FilterValue,
	GroupId,
	List,
	ListQuery,
	ListWhere,
	SortId,
} from "#lib/components/data-table/list-definition.ts";
import { noneToken } from "#lib/components/data-table/url-state.ts";

/**
 * The SQL for every column a list's definition sorts, groups or filters by, and nothing else: a
 * column left out, or one the definition doesn't have, is a type error.
 */
export type SqlColumns<C> = {
	[K in SortId<C> | GroupId<C> | FilterId<C>]: (K extends SortId<C>
		? {
				/** What it sorts by, ascending; several to break ties, e.g. manufacturer, then model. */
				sort: SQLWrapper | readonly SQLWrapper[];
				/** Rows without a value (null) come last in either direction. */
				nullsLast?: boolean;
			}
		: unknown) &
		(K extends GroupId<C>
			? {
					/**
					 * What its rows are grouped by: the value the table groups the rows by (its
					 * `getGroupingValue`, else its value), e.g. a customer's code where the column shows
					 * its name. Rows are sorted by `sort` first (if any), then by this.
					 */
					group: SQLWrapper;
				}
			: unknown) &
		(K extends FilterId<C>
			? {
					/** Keeps the rows with any of the values. */
					filter: (values: FilterValue<C, K & keyof C>[]) => SQL | undefined;
				}
			: unknown);
};

/**
 * How a list's query maps onto SQL. Build it per request (a function returning it), as
 * `inTenant()` reads the request.
 */
export interface ListSql<C> {
	list: List<C>;
	/**
	 * The list's table with its joins, each scoped to the tenant (`inTenant()`), selecting `fields`:
	 * for counts, facets and ids. Write the joins once, in a function generic over the whole query
	 * (drizzle's `$dynamic()` pattern: `<T extends SQLiteSelect>(query: T) => query.innerJoin(…)`),
	 * and have the rows' query use it too.
	 */
	from: (fields: SelectedFields) => SQLiteSelect;
	columns: SqlColumns<C>;
	/** What the search box searches: each word must be in one of them, in any case. */
	search: readonly SQLWrapper[];
	/** The row's id: the last sort, so rows don't move between pages, and what bulk targets find. */
	id: SQLWrapper;
	/** The rows the current user may see, e.g. `() => inTenant(order)`; part of every `where`. */
	scope: () => SQL;
	/**
	 * The modules' columns of a list that has them (added by `withModuleColumns()`, see
	 * `module-columns.ts`), by id: what each shows (`moduleValues()`) and what its rows count under
	 * in its filter (`moduleFacets()`).
	 */
	modules?: Readonly<Record<string, { value: SQLWrapper; facet?: SQLWrapper }>>;
}

/** What decides which rows match a list's search and filters. */
export interface ListWherePlan<C> {
	/**
	 * The scope, the filters and the search; without the filter of `except` (a column id), for the
	 * counts in that column's filter (which shouldn't depend on what's ticked in it).
	 */
	where(except?: FilterId<C>): SQL | undefined;
	/** How many rows match. */
	count(): Promise<number>;
	/**
	 * How many rows have each value of some columns, for the counts in their filters: those that
	 * match the search and the other filters, as in TanStack's faceting. Returns the counts by
	 * column id and value; the rows without a value count under `none` (`noneToken`).
	 */
	facets<Id extends FilterId<C>>(
		columns: Readonly<Record<Id, SQLWrapper>>,
	): Promise<Record<Id, Record<string, number>>>;
	/** The ids of at most `limit` of the rows that match, in order of id. */
	ids(limit: number): Promise<number[]>;
}

/** A page of a list's rows. */
export interface ListPlan<C> extends ListWherePlan<C> {
	orderBy: SQL[];
	/** The rows to fetch: the page's, plus the row before and after it when grouped. */
	limit: number;
	offset: number;
	/** The column the rows are grouped by, and its value in SQL (`SqlColumns.group`). */
	group?: { id: GroupId<C>; value: SQLWrapper };
	/**
	 * Puts the filters, the order and the page on a `select` of the list's rows (the joins of
	 * `ListSql.from`, with the fields wanted), e.g.
	 * `plan.paged(withOrderJoins(db.select({ … }).from(order).$dynamic()))`.
	 */
	paged<Q extends SQLiteSelect>(query: Q): Q;
	/**
	 * The fetched rows (`limit` from `offset`, in order) split into the page's and, when grouped,
	 * the rows just before and after it, if there are any.
	 */
	page<Row>(fetched: Row[]): { rows: Row[]; previous?: Row; next?: Row };
	/**
	 * When grouped, how many rows each group has (by `groupKey`), among those matching the search and
	 * the filters: for the group rows' counts. `undefined` when not grouped.
	 */
	groupCounts(): Promise<Record<string, number> | undefined>;
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

/**
 * A filter's condition: the rows whose `expression` is one of `values`, where `null` (a filter
 * made with `orNone()`) is the rows without a value, e.g. `filter: (ids) => anyOf(order.engineerId, ids)`.
 */
export function anyOf(expression: SQLWrapper, values: readonly unknown[]) {
	const some = values.filter((value) => value !== null);
	return or(
		...(some.length ? [inArray(expression, some)] : []),
		...(some.length < values.length ? [isNull(expression)] : []),
	);
}

/**
 * A search's condition: each word of `text` is in one of `columns`, in any case (for letters
 * without accents: SQLite's `like`). `undefined` for an empty search.
 */
export function searchMatch(columns: readonly SQLWrapper[], text: string) {
	const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 10);
	if (!words.length || !columns.length) return undefined;
	return and(...words.map((word) => or(...columns.map((column) => contains(column, word)))));
}

/** A column of a list's SQL, whatever the list's types: what the planner reads. */
interface LooseColumn {
	sort?: SQLWrapper | readonly SQLWrapper[];
	nullsLast?: boolean;
	filter?: (values: any[]) => SQL | undefined;
	group?: SQLWrapper;
}

/** A list's SQL and query, untyped: what `planList()` reads. */
type LooseSql = Pick<ListSql<unknown>, "from" | "search" | "id" | "scope"> & {
	columns: Readonly<Record<string, LooseColumn | undefined>>;
};
type LooseQuery = Omit<ListQuery<any>, "filters"> & {
	filters: Readonly<Record<string, readonly unknown[] | undefined>>;
};

/** What a column sorts by, ascending. */
const sortOf = (column: LooseColumn): readonly SQLWrapper[] =>
	column.sort === undefined
		? []
		: Array.isArray(column.sort)
			? column.sort
			: [column.sort as SQLWrapper];

/** Plans a query on a list's SQL. */
function buildPlan(source: LooseSql, query: LooseQuery) {
	const where = (except?: string) => {
		const filters = Object.entries(source.columns).flatMap(([id, column]) => {
			const values = id === except ? undefined : query.filters[id];
			const condition = values?.length ? column?.filter?.(values as unknown[]) : undefined;
			return condition ? [condition] : [];
		});
		return and(source.scope(), ...filters, searchMatch(source.search, query.q));
	};

	const order = (column: LooseColumn, desc: boolean, expressions = sortOf(column)) => {
		const direction = sql.raw(desc ? "desc" : "asc");
		const nulls = sql.raw(column.nullsLast ? " nulls last" : "");
		return expressions.map((expression) => sql`${expression} ${direction}${nulls}`);
	};
	const groupColumn = query.group === null ? undefined : source.columns[query.group];
	const group = groupColumn?.group ? { id: query.group!, value: groupColumn.group } : undefined;
	// By the group first (descending if sorted so), as the table's `sortGroupsFirst` does.
	const groupDesc = query.sort.find((sort) => sort.id === query.group)?.desc ?? false;
	const orderBy = group
		? order(groupColumn!, groupDesc, [...sortOf(groupColumn!), group.value])
		: [];
	for (const { id, desc } of query.sort) {
		const column = source.columns[id];
		if (!(group && id === group.id) && column?.sort) orderBy.push(...order(column, desc));
	}
	orderBy.push(sql`${source.id} asc`);

	const { pageIndex, pageSize } = query;
	const offset = pageIndex * pageSize;
	// When grouped, one more on either side.
	const before = group && offset > 0 ? 1 : 0;
	const after = group ? 1 : 0;

	/** How many rows match `where` for each value of `by`. */
	const countBy = async (where: SQL | undefined, by: SQLWrapper) =>
		(await source
			.from({ value: sql<unknown>`${by}`, count: countRows() })
			.where(where)
			.groupBy(sql`${by}`)) as { value: unknown; count: number }[];

	return {
		where,
		orderBy,
		limit: pageSize + before + after,
		offset: offset - before,
		group,
		page: <Row>(fetched: Row[]) => {
			if (!group) return { rows: fetched };
			return {
				rows: fetched.slice(before, before + pageSize),
				previous: before ? fetched[0] : undefined,
				next: fetched[before + pageSize],
			};
		},
		paged: <Q extends SQLiteSelect>(select: Q) =>
			select
				.where(where())
				.orderBy(...orderBy)
				.limit(pageSize + before + after)
				.offset(offset - before) as Q,
		count: async () => {
			const [row] = (await source.from({ total: countRows() }).where(where())) as {
				total: number;
			}[];
			return row.total;
		},
		facets: <Id extends string>(columns: Readonly<Record<Id, SQLWrapper>>) =>
			facetCounts({ where }, columns, countBy),
		ids: async (limit: number) => {
			const rows = (await source
				.from({ id: sql<number>`${source.id}` })
				.where(where())
				.orderBy(sql`${source.id} asc`)
				.limit(limit)) as { id: number }[];
			return rows.map((row) => row.id);
		},
		groupCounts: () => groupCounts({ where, group }, countBy),
	};
}

/**
 * Plans a list's query (`ListQuery` for a page of rows, or `ListWhere` for the rows that match,
 * for counts, facets and bulk targets) on the list's SQL: build `sql` per request, since it reads
 * the tenant.
 */
export function planList<C>(listSql: ListSql<C>, query: ListQuery<C>): ListPlan<C>;
export function planList<C>(listSql: ListSql<C>, query: ListWhere<C>): ListWherePlan<C>;
export function planList<C>(listSql: ListSql<C>, query: ListWhere<C> | ListQuery<C>) {
	// The remote function's schema let any module column through (`List.query`): only the
	// tenant's own columns, with their own values, are planned.
	if (listSql.list.point) {
		const { strict } = listSql.list;
		if (!v.is("sort" in query ? strict.query : strict.where, query)) {
			error(400, m.common_error_generic());
		}
	}
	const source = listSql as unknown as LooseSql;
	if ("sort" in query) return buildPlan(source, query as unknown as LooseQuery);
	const { where, count, facets, ids } = buildPlan(source, {
		...(query as unknown as LooseQuery),
		sort: [],
		group: null,
		pageIndex: 0,
		pageSize: 1,
	});
	return { where, count, facets, ids };
}

/**
 * How many rows have each value of some columns, for the counts in their filters: the rows that
 * match the search and the other filters, as in TanStack's faceting. `count` counts the list's
 * rows that match `where` by the value of `by`, as `{ value, count }` (e.g. a `select` from the
 * list's tables `where(where).groupBy(by)`). Returns the counts by column id and value, the rows
 * without a value under `none`.
 */
async function facetCounts<Id extends string>(
	plan: { where(except?: string): SQL | undefined },
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
			Object.fromEntries(
				counted[index].map((row) => {
					// Facet values are text or numbers (e.g. ids), or null for rows without one.
					const value = row.value as string | number | null;
					return [value === null ? noneToken : String(value), row.count];
				}),
			),
		]),
	) as Record<Id, Record<string, number>>;
}

/**
 * When the plan is grouped, how many rows each group has (by `groupKey`), among those matching
 * the search and the filters: for the group rows' counts. `count` is as for `facetCounts`.
 */
async function groupCounts(
	plan: { where(except?: string): SQL | undefined; group?: { value: SQLWrapper } },
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
