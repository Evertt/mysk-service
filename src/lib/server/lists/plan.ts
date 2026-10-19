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
 * (`src/lib/orders/server/list-sql.ts`) is the example.
 *
 * Grouped (see `#lib/components/data-table/grouping.ts`), the rows are sorted by the group first,
 * and the plan fetches one row more on either side of the page: `plan.page()` splits them off, for
 * the table to tell whether the page's first and last groups go on beyond it, and `groupCounts()`
 * counts each group's rows on every page.
 */
import { error } from "@sveltejs/kit";
import {
	and,
	type Column,
	count as countRows,
	gte,
	isNull,
	lt,
	lte,
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
import { type DateRange, type NumberRange } from "#lib/components/data-table/ranges.ts";
import { searchWords } from "#lib/components/data-table/search-words.ts";
import { noneToken } from "#lib/components/data-table/url-state.ts";
import { getTimeZone } from "#lib/dates.ts";
import { formatNumber } from "#lib/i18n/format.ts";
import { inList } from "#lib/server/db/parameters.ts";

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
		(K extends FilterId<C> ? FilterSql<FilterValue<C, K & keyof C>> : unknown);
};

/** How a column's filter keeps rows: in SQL, or, for a value SQL doesn't have, by their ids. */
type FilterSql<T> =
	| {
			/** Keeps the rows with any of the values. */
			filter: (values: T[]) => SQL | undefined;
			match?: never;
	  }
	| {
			/**
			 * For a value that isn't in the database but computed in code, e.g. an order's total, which
			 * the modules adjust (`priceOrders()`): of the rows that match the search and the other
			 * filters (by id, at most `MAX_MATCHED_ROWS`), those whose value is any of `values`. The
			 * plan keeps them by id, so the rows, counts, facets and bulk ids all agree.
			 */
			match: (values: T[], ids: number[]) => Promise<number[]>;
			filter?: never;
	  };

/** The most rows a computed filter (`FilterSql.match`) looks at; beyond, the request is refused. */
const MAX_MATCHED_ROWS = 10_000;

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
	where(except?: FilterId<C>): Promise<SQL | undefined>;
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
	paged<Q extends SQLiteSelect>(query: Q): Promise<Awaited<Q>>;
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
		...(some.length ? [inList(expression, some)] : []),
		...(some.length < values.length ? [isNull(expression)] : []),
	);
}

/**
 * A date range filter's condition (`dateRange`): the rows whose `column` is on one of the days of
 * any of the ranges, both ends included, e.g. `filter: (ranges) => inDays(order.scheduledFor,
 * ranges)`. A day column (`day`) is compared as days; a moment's (`moment`) from the start of the
 * first day to the end of the last in the user's time zone (`getTimeZone()`). Rows without a date
 * are in no range; `null` among the ranges (`orNone(dateRange)`, `none` in the URL) keeps them.
 */
export function inDays(column: Column, ranges: readonly (DateRange | null)[]) {
	const days = column.getSQLType() === "text";
	const start = (day: Temporal.PlainDate) =>
		days ? day : day.toZonedDateTime(getTimeZone()).toInstant();
	return or(
		...ranges.map((range) => {
			if (range === null) return isNull(column);
			const from = range.from === null ? undefined : Temporal.PlainDate.from(range.from);
			const to = range.to === null ? undefined : Temporal.PlainDate.from(range.to);
			return and(
				sql`${column} is not null`,
				from && gte(column, start(from)),
				to && (days ? lte(column, to) : lt(column, start(to.add({ days: 1 })))),
			);
		}),
	);
}

/**
 * A number or money range filter's condition (`numberRange`, `moneyRange` in cents): the rows
 * whose `expression` is in any of the ranges, both ends included, e.g. `filter: (ranges) =>
 * between(material.stock, ranges)`. Rows without a value are in no range; `null` among the
 * ranges keeps them.
 */
export function between(expression: SQLWrapper, ranges: readonly (NumberRange | null)[]) {
	return or(
		...ranges.map((range) =>
			range === null
				? sql`${expression} is null`
				: and(
						sql`${expression} is not null`,
						range.from === null ? undefined : gte(expression, range.from),
						range.to === null ? undefined : lte(expression, range.to),
					),
		),
	);
}

/**
 * A search's condition: each word of `text` (`searchWords()`) is in one of `columns`, in any case
 * (for letters without accents: SQLite's `like`). `undefined` for an empty search.
 *
 * The columns are searched as one text, a value a line, so each word binds once,
 * however many columns there are: a word per column would bind ten per column of the 100 a
 * statement may. A word has no white space, so it's never found across two of the values.
 */
export function searchMatch(columns: readonly SQLWrapper[], text: string) {
	const words = searchWords(text);
	if (!words.length || !columns.length) return undefined;
	const searched =
		columns.length === 1
			? columns[0]
			: sql`(${sql.join(
					columns.map((column) => sql`coalesce(${column}, '')`),
					sql` || char(10) || `,
				)})`;
	return and(...words.map((word) => contains(searched, word)));
}

/** A column of a list's SQL, whatever the list's types: what the planner reads. */
interface LooseColumn {
	sort?: SQLWrapper | readonly SQLWrapper[];
	nullsLast?: boolean;
	filter?: (values: any[]) => SQL | undefined;
	match?: (values: any[], ids: number[]) => Promise<number[]>;
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
	/** The columns with values to filter by, but for `except`'s. */
	const filtered = (except?: string) =>
		Object.entries(source.columns).flatMap(([id, column]) => {
			const values = id === except ? undefined : query.filters[id];
			return column && values?.length ? [{ id, column, values: values as unknown[] }] : [];
		});

	/**
	 * Per computed filter (`match`), what it made of each row so far: the facets' conditions (one
	 * per column, in parallel) look at mostly the same rows, and each is asked about once. One
	 * `match` at a time per column, so they don't ask about the same rows together.
	 */
	const matched = new Map<string, { kept: Map<number, boolean>; queue: Promise<unknown> }>();
	async function matching(id: string, column: LooseColumn, values: unknown[], ids: number[]) {
		let known = matched.get(id);
		if (!known) matched.set(id, (known = { kept: new Map(), queue: Promise.resolve() }));
		const { kept } = known;
		const run = known.queue.then(async () => {
			const fresh = ids.filter((row) => !kept.has(row));
			if (!fresh.length) return;
			const found = new Set(await column.match!(values, fresh));
			for (const row of fresh) kept.set(row, found.has(row));
		});
		known.queue = run.catch(() => {});
		await run;
		return ids.filter((row) => kept.get(row));
	}

	/** The filters SQL has, then those computed in code (`match`), narrowing down by id. */
	async function conditionFor(except?: string) {
		const columns = filtered(except);
		const inSql = columns.flatMap(({ column, values }) => {
			const condition = column.filter?.(values);
			return condition ? [condition] : [];
		});
		let condition = and(source.scope(), ...inSql, searchMatch(source.search, query.q));
		for (const { id, column, values } of columns) {
			if (!column.match) continue;
			const rows = (await source
				.from({ id: sql<number>`${source.id}` })
				.where(condition)
				.limit(MAX_MATCHED_ROWS + 1)) as { id: number }[];
			if (rows.length > MAX_MATCHED_ROWS) {
				error(400, m.common_table_filter_too_many({ max: formatNumber(MAX_MATCHED_ROWS) }));
			}
			const kept = await matching(
				id,
				column,
				values,
				rows.map((row) => row.id),
			);
			condition = and(condition, kept.length ? inList(source.id, kept) : sql`0`);
		}
		return condition;
	}

	// Each asked for once, though the rows, the count and the groups all want it.
	const conditions = new Map<string, Promise<SQL | undefined>>();
	const where = (except?: string) => {
		const key = except ?? "";
		let found = conditions.get(key);
		if (!found) conditions.set(key, (found = conditionFor(except)));
		return found;
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
	const countBy = async (where: Promise<SQL | undefined>, by: SQLWrapper) =>
		(await source
			.from({ value: sql<unknown>`${by}`, count: countRows() })
			.where(await where)
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
		paged: async <Q extends SQLiteSelect>(select: Q) =>
			(await select
				.where(await where())
				.orderBy(...orderBy)
				.limit(pageSize + before + after)
				.offset(offset - before)) as Awaited<Q>,
		count: async () => {
			const [row] = (await source.from({ total: countRows() }).where(await where())) as {
				total: number;
			}[];
			return row.total;
		},
		facets: <Id extends string>(columns: Readonly<Record<Id, SQLWrapper>>) =>
			facetCounts({ where }, columns, countBy),
		ids: async (limit: number) => {
			const rows = (await source
				.from({ id: sql<number>`${source.id}` })
				.where(await where())
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
	plan: { where(except?: string): Promise<SQL | undefined> },
	columns: Readonly<Record<Id, SQLWrapper>>,
	count: (
		where: Promise<SQL | undefined>,
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
	plan: { where(except?: string): Promise<SQL | undefined>; group?: { value: SQLWrapper } },
	count: (
		where: Promise<SQL | undefined>,
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
