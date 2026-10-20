/**
 * A list's definition: one description of what a list sorts, groups and filters by, and with which
 * values, from which the rest follows:
 *
 * - the **table's columns** (`withListColumns()`): what each sorts, groups and filters by, and its
 *   name in the URL, so the table can't say otherwise;
 * - its **toolbar** (`ListToolbar`): a filter for each column that filters, of its filter's kind;
 * - the **query**: a typed object (`ListQuery`) that a list's remote query takes, with a strict
 *   valibot schema (`List.query`), so a client bug or a tampered request is a 400, not a list that
 *   quietly ignores it;
 * - the **URL spec** (`List.urlSpec`) that reads and writes the table's state in the URL, which
 *   stays lenient (`url-state.ts`: what is invalid is the default), as links and saved views are
 *   strings;
 * - `toListQuery()`, the only way to build the query from a table's state: one canonical object
 *   per state, as SvelteKit caches a query by its raw argument.
 *
 * ```ts
 * export const ordersList = defineList({
 * 	columns: {
 * 		customer: { sort: true, group: true, filter: code }, // by customer code
 * 		status: { sort: true, group: true, filter: oneOf(orderStatuses) },
 * 		engineer: { sort: true, group: true, filter: orNone(id) }, // by engineer id: (number | null)[]
 * 		scheduledFor: { param: "scheduled", sort: true, filter: orNone(dateRange) }, // [null, { from, to }]
 * 		createdAt: { param: "created", sort: true },
 * 	},
 * 	defaults: { sort: [{ id: "createdAt", desc: true }] },
 * });
 * ```
 *
 * A list is in one of two modes. A **server** list (the default) searches, filters, sorts and
 * pages in the database (`createServerTable()`, `planList()`): for lists that grow. A **client**
 * list (`mode: "client"`) loads all its rows and does that in the browser (`createClientTable()`):
 * for small lists, where it's instant and costs the server nothing. Both have the same columns,
 * toolbar and URL grammar from their definition; only where the rows are filtered differs.
 *
 * Pure, with no server imports: the page, the table and the server's SQL mapping
 * (`ListSql` in `#lib/server/lists/plan.ts`) all read the same definition.
 */
import type { ColumnDef } from "@tanstack/svelte-table";
import * as v from "valibot";

import { isDay } from "#lib/dates.ts";
import type { ListColumnsPoint } from "#lib/extensions/define.ts";
import { recordId, wholeIn } from "#lib/schema.ts";

import type { Features } from "./features.ts";
import { type ModuleListColumn, moduleColumnIdPattern } from "./module-columns.ts";
import {
	type DateRange,
	dateRangeToken,
	isOrdered,
	isRangeCents,
	isRangeNumber,
	type NumberRange,
	moneyRangeToken,
	numberRangeToken,
	parseDateRange,
	parseMoneyRange,
	parseNumberRange,
	type Range,
	type RangeGrammar,
} from "./ranges.ts";
import {
	filterValues,
	noneToken,
	parseTableUrl,
	type TableUrlSpec,
	type TableUrlState,
} from "./url-state.ts";

/** What a query may hold, so that its URL stays well under the servers' limit (16 KB). */
export const listLimits = {
	/** The search text. */
	search: 200,
	/**
	 * The words of the search that count (`searchWords()`); the rest are ignored. On the server
	 * each binds a value, of the 100 a statement may (`searchMatch()`).
	 */
	words: 10,
	/** The values of one filter. */
	values: 50,
	/** The values of one range filter (`dateRange`, …): ranges, and `none`. */
	ranges: 10,
	/** The page index. */
	pageIndex: 100_000,
	/** The query as JSON, in bytes: with `devalue`'s overhead its payload stays under 8 KB. */
	bytes: 4000,
} as const;

/** How a filter's values look in the query, and in the URL. */
export interface FilterKind<T> {
	/** A valid value. */
	value: v.GenericSchema<T>;
	/** A value from the URL's token (checked with `value` afterwards, so it may not fit). */
	fromUrl: (token: string) => unknown;
	/** A value as the URL's token. */
	toUrl: (value: T) => string;
	/** The tokens the URL accepts, if there is a fixed set of them (`TableUrlColumn.values`). */
	values?: readonly string[];
	/**
	 * For a range filter (`dateRange`, `numberRange`), how the URL writes it: a filter with one
	 * value, a range, rather than a set of values.
	 */
	range?: RangeGrammar;
	/**
	 * Whether it takes `none`, the rows without a value (`orNone()`): a set filter's `none` option,
	 * or a range filter's (`orNone(dateRange)`, see `TableUrlColumn.none`).
	 */
	none?: boolean;
}

/** A filter on a text, e.g. a customer's code. */
export const code: FilterKind<string> = {
	value: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
	fromUrl: (token) => token,
	toUrl: (value) => value,
};

/** A filter on a record's id (a positive whole number). */
export const id: FilterKind<number> = {
	value: recordId(),
	fromUrl: (token) => (/^\d{1,15}$/.test(token) ? Number(token) : Number.NaN),
	toUrl: String,
};

/** A filter on one of a fixed set of values, e.g. an order's status. */
export const oneOf = <const T extends readonly [string, ...string[]]>(
	values: T,
): FilterKind<T[number]> => ({
	value: v.picklist(values),
	fromUrl: (token) => token,
	toUrl: (value) => value,
	values,
});

/**
 * A filter on a column that can be empty: `kind`'s values, or `null` for the rows without one,
 * `none` in the URL (`?engineer=none,12`: unassigned orders and engineer 12's). The SQL keeps them
 * with `anyOf()` (`#lib/server/lists/plan.ts`), and the facets count them under `none`.
 */
export const orNone = <T>(kind: FilterKind<T>): FilterKind<T | null> => ({
	value: v.nullable(kind.value),
	fromUrl: (token) => (token === noneToken ? null : kind.fromUrl(token)),
	toUrl: (value) => (value === null ? noneToken : kind.toUrl(value)),
	...(kind.values ? { values: [...kind.values, noneToken] } : {}),
	...(kind.range ? { range: kind.range } : {}),
	none: true,
});

/** A range's schema: both ends, either may be open (`null`) but not both, in order. */
const rangeOf = <T extends string | number>(end: v.GenericSchema<T>) =>
	v.pipe(
		v.strictObject({ from: v.nullable(end), to: v.nullable(end) }),
		v.check(isOrdered, m.common_error_generic),
	);

/**
 * A filter on a date, by ranges of days (`ranges.ts`): `?scheduled=2026-10-01..2026-10-07`,
 * `..2026-10-07`, or presets that stay relative in the URL, on their own or as an end:
 * `?scheduled=this-week`, `?scheduled=today..`. The query has the days they mean when it's built
 * (`toListQuery()`). Several ranges keep the rows in any of them, and with `orNone(dateRange)`,
 * `none` the rows without a date (`?scheduled=none,this-week`); the SQL keeps them with `inDays()`
 * (`#lib/server/lists/plan.ts`).
 */
export const dateRange: FilterKind<DateRange> = {
	value: rangeOf(v.custom<string>(isDay)),
	fromUrl: (token) => parseDateRange(token),
	toUrl: dateRangeToken,
	range: "dateRange",
};

/**
 * A filter on a number, by ranges: `?quantity=..10` (at most 10), `5..` (at least 5), `5..10`,
 * `2,5..8,12` (any of them). The SQL keeps the rows in them with `between()`.
 */
export const numberRange: FilterKind<NumberRange> = {
	value: rangeOf(v.custom<number>(isRangeNumber)),
	fromUrl: (token) => parseNumberRange(token),
	toUrl: numberRangeToken,
	range: "numberRange",
};

/**
 * A filter on an amount of money stored in cents, by ranges in euros in the URL (`?price=..12.50`,
 * `?total=500..`; at most two decimals) and in cents in the query (`{ from: null, to: 1250 }`),
 * converted digit by digit, so no amount is off by a rounding. The SQL keeps the rows in them with
 * `between()` on the cents.
 */
export const moneyRange: FilterKind<NumberRange> = {
	value: rangeOf(v.custom<number>(isRangeCents)),
	fromUrl: (token) => parseMoneyRange(token),
	toUrl: moneyRangeToken,
	range: "moneyRange",
};

/** What a column of a list can do. */
export interface ListColumn {
	/** Its name in the URL, if not its id (see `TableUrlColumn.param`). */
	param?: string;
	/** Whether the list can be sorted by it. */
	sort?: boolean;
	/** Whether the list can be grouped by it. */
	group?: boolean;
	/** The values the list can be filtered by on it. */
	filter?: FilterKind<any>;
}

/** The columns of a list, by id. */
export type ListColumns = Readonly<Record<string, ListColumn>>;

export type SortId<C> = { [K in keyof C]: C[K] extends { sort: true } ? K : never }[keyof C] &
	string;
export type GroupId<C> = { [K in keyof C]: C[K] extends { group: true } ? K : never }[keyof C] &
	string;
export type FilterId<C> = {
	[K in keyof C]: C[K] extends { filter: FilterKind<any> } ? K : never;
}[keyof C] &
	string;
/** The type of one value of a column's filter. */
export type FilterValue<C, K extends keyof C> = C[K] extends { filter: FilterKind<infer T> }
	? T
	: never;

/** Which rows match: the search and the filters (what facets and bulk targets take). */
export interface ListWhere<C> {
	q: string;
	filters: { [K in FilterId<C>]?: FilterValue<C, K>[] };
}

/**
 * A page of rows: the rows query's argument. Canonical (see `toListQuery`): every key present,
 * nothing `undefined`, filters without empty ones. The table scrolls through the pages (see
 * `scrollPages()` in `server-table.svelte.ts`), loading the next as it nears the end.
 */
export interface ListQuery<C> extends ListWhere<C> {
	/** By precedence. */
	sort: { id: SortId<C>; desc: boolean }[];
	/** The column the rows are grouped by, if any. */
	group: GroupId<C> | null;
	/** 0-based. */
	pageIndex: number;
	pageSize: number;
}

/**
 * Where a list's rows are searched, filtered, sorted and paged: in the database (`server`), or in
 * the browser, which has them all (`client`).
 */
export type ListMode = "server" | "client";

/** What a list is made of: its columns and where it starts. */
export interface ListDef<C extends ListColumns, M extends ListMode = ListMode> {
	/** `server` if not given. */
	mode?: M;
	columns: C;
	defaults?: {
		/** The sorting when the URL has none. */
		sort?: readonly { id: SortId<C>; desc: boolean }[];
		group?: GroupId<C>;
		filters?: { [K in FilterId<C>]?: readonly FilterValue<C, K>[] };
		/** How many rows a page has, which the table loads at a time; 50 if not given. */
		pageSize?: number;
	};
	/**
	 * The extension point through which modules add columns to the list (see `module-columns.ts`),
	 * if they may.
	 */
	moduleColumns?: ListColumnsPoint;
}

/** A defined list. */
export interface List<C, M extends ListMode = "server"> {
	mode: M;
	/**
	 * Its columns: the definition's, and, in a list `extendList()` made, the modules' (by their
	 * namespaced ids, which the type doesn't name).
	 */
	columns: C;
	/** What it was defined from, for `extendList()`. */
	definition: ListDef<ListColumns>;
	/** The modules' columns in it (`extendList()`), in order. */
	moduleColumns: readonly ModuleListColumn[];
	/** The filtered columns' kinds, by id. */
	filterKinds: Readonly<Record<string, FilterKind<any>>>;
	sortIds: readonly string[];
	groupIds: readonly string[];
	/** How many rows a page has (the only size the query accepts). */
	pageSize: number;
	/** How the table's state maps onto the URL. */
	urlSpec: TableUrlSpec;
	/**
	 * A remote query's argument for a page of rows. For a list modules add columns to, it also takes
	 * filters and sorts on any module column's id (`<module>.<name>`), whose values `planList()` then
	 * checks against the tenant's list (`strict`).
	 */
	query: v.GenericSchema<ListQuery<C>>;
	/** A remote query's argument for the counts in the filters and for bulk targets; like `query`. */
	where: v.GenericSchema<ListWhere<C>>;
	/** `query` and `where` for exactly this list's columns: nothing else gets through. */
	strict: { query: v.GenericSchema<ListQuery<C>>; where: v.GenericSchema<ListWhere<C>> };
	/** The point modules add columns through, if they may (`ListDef.moduleColumns`). */
	point?: ListColumnsPoint;
}

const defaultPageSize = 50;

/** The size of a value as JSON, in bytes. */
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * The URL spec for a definition. Throws, as `parseTableUrl` does, when two columns would share a
 * name in the URL, so a mistake shows when the list is defined, not at its first request.
 */
export function toUrlSpec<C extends ListColumns>(def: ListDef<C>): TableUrlSpec {
	const { defaults } = def;
	const group = defaults?.group;
	const filters = Object.entries(defaults?.filters ?? {}) as [string, readonly unknown[]][];
	const spec: TableUrlSpec = {
		columns: Object.entries(def.columns).map(([id, column]) => ({
			id,
			...(column.param ? { param: column.param } : {}),
			...(column.sort ? { sortable: true } : {}),
			...(column.group ? { groupable: true } : {}),
			...(column.filter
				? {
						filter: column.filter.range ?? ("set" as const),
						...(column.filter.values ? { values: column.filter.values } : {}),
						...(column.filter.range && column.filter.none ? { none: true } : {}),
					}
				: {}),
		})),
		defaults: {
			sorting: (defaults?.sort ?? []).map(({ id, desc }) => ({ id, desc })),
			...(group ? { grouping: [group] } : {}),
			...(filters.length
				? {
						columnFilters: filters.map(([id, values]) => ({
							id,
							value: values.map((value) => def.columns[id].filter!.toUrl(value)),
						})),
					}
				: {}),
		},
	};
	parseTableUrl(new URLSearchParams(), spec);
	return spec;
}

/** Defines a list from its columns: a server-side one unless its `mode` is `client`. */
export function defineList<const C extends ListColumns, const M extends ListMode = "server">(
	def: ListDef<C, M>,
): List<C, M> {
	const columns = Object.entries(def.columns);
	const sortIds = columns.filter(([, column]) => column.sort).map(([id]) => id);
	const groupIds = columns.filter(([, column]) => column.group).map(([id]) => id);
	const filterKinds = Object.fromEntries(
		columns.flatMap(([id, column]) => (column.filter ? [[id, column.filter]] : [])),
	);
	const pageSize = def.defaults?.pageSize ?? defaultPageSize;

	const shape = { filterKinds, sortIds, groupIds, pageSize };
	const strict = listSchemas(shape, false);
	const boundary = def.moduleColumns ? listSchemas(shape, true) : strict;
	return {
		mode: def.mode ?? ("server" as M),
		columns: def.columns,
		definition: def as unknown as ListDef<ListColumns>,
		moduleColumns: [],
		filterKinds,
		sortIds,
		groupIds,
		pageSize,
		urlSpec: toUrlSpec(def),
		query: boundary.query as unknown as v.GenericSchema<ListQuery<C>>,
		where: boundary.where as unknown as v.GenericSchema<ListWhere<C>>,
		strict: strict as unknown as List<C, M>["strict"],
		...(def.moduleColumns ? { point: def.moduleColumns } : {}),
	};
}

/** A filter kind's function in the table (see `features.ts`), by its URL grammar. */
const filterFns = {
	set: "oneOf",
	dateRange: "inDateRange",
	numberRange: "inNumberRange",
	moneyRange: "inMoneyRange",
} as const;

/**
 * What a table's column takes from its list's column: whether it sorts and groups, its name in the
 * URL, and its filter's kind (its function, its values, whether it takes `none`). A set filter keeps
 * the rows by their grouping value (`getGroupingValue`, else the column's value) as the URL has it,
 * e.g. a customer's code where the column shows its name.
 */
export function listColumnOptions(column: ListColumn) {
	const kind = column.filter;
	const grammar: "set" | RangeGrammar | undefined = kind ? (kind.range ?? "set") : undefined;
	return {
		enableSorting: Boolean(column.sort),
		enableGrouping: Boolean(column.group),
		...(grammar ? { filterFn: filterFns[grammar] } : {}),
		meta: {
			...(column.param ? { param: column.param } : {}),
			...(grammar ? { filter: grammar } : {}),
			...(kind?.values ? { filterValues: kind.values } : {}),
			...(kind?.none ? { filterNone: true } : {}),
		},
	};
}

/** The ids of a table's columns that aren't the list's: the selection's and the row actions'. */
type DisplayColumnId = "select" | "actions";

/** What `withListColumns()` reads of a table's column (one of TanStack's). */
interface TableColumn {
	id?: string;
	meta?: object;
}

/** The rows of a table with these columns. */
type RowOf<T> = T[keyof T] extends ColumnDef<Features, infer Row, any> ? Row : never;

/**
 * A list's table columns, by id, in their order: each of the list's columns (an id the list
 * doesn't have is a type error) and the display columns, `select` and `actions`. Each takes what
 * the definition says of it (`listColumnOptions()`), which it doesn't say itself: its cell, label,
 * search and the value it groups and filters by (`getGroupingValue`, the URL's, if not its own).
 * A column made from a function (and a display column) names its `id` too, as TanStack wants: the
 * same as its key.
 *
 * ```ts
 * export const columns = withListColumns(ordersList, {
 * 	select: column.select(),
 * 	number: column.accessor("number", { cell: …, meta: { label: m.orders_column_order } }),
 * 	customer: column.accessor((row) => row.customer.name, {
 * 		id: "customer",
 * 		getGroupingValue: (row) => row.customer.code,
 * 		meta: { label: m.orders_column_customer },
 * 	}),
 * 	actions: column.display({ id: "actions", cell: … }),
 * });
 * ```
 */
export function withListColumns<
	C extends ListColumns,
	const T extends Readonly<Record<string, TableColumn>>,
>(
	list: Pick<List<C, ListMode>, "columns">,
	columns: T & { readonly [K in Exclude<keyof T, (keyof C & string) | DisplayColumnId>]: never },
): ColumnDef<Features, RowOf<T>, any>[] {
	const own = list.columns as ListColumns;
	return Object.entries(columns).map(([id, column]: [string, TableColumn]) => {
		if (column.id !== undefined && column.id !== id) {
			throw new Error(`The column "${id}" is called "${column.id}"`);
		}
		const listed = Object.hasOwn(own, id) ? own[id] : undefined;
		if (!listed) {
			if (id !== "select" && id !== "actions") {
				throw new Error(`The list has no column "${id}"`);
			}
			return { ...column, id };
		}
		const options = listColumnOptions(listed);
		return { ...column, id, ...options, meta: { ...column.meta, ...options.meta } };
	});
}

/** Any module column's filter values, at the boundary (`planList()` checks them against the column). */
const anyFilterValues = v.pipe(
	v.array(v.union([v.pipe(v.string(), v.maxLength(64)), v.number(), v.null()])),
	v.minLength(1),
	v.maxLength(listLimits.values),
);
const anyModuleColumn = v.pipe(v.string(), v.regex(moduleColumnIdPattern));

/**
 * The schemas of a list's query and where. `withModuleColumns` also lets through filters and sorts
 * on any module column's id (`<module>.<name>`), with values of any filter's shape: the remote
 * function's boundary, before `planList()` checks them against the tenant's list.
 */
function listSchemas(
	{
		filterKinds,
		sortIds,
		groupIds,
		pageSize,
	}: {
		filterKinds: Record<string, FilterKind<any>>;
		sortIds: string[];
		groupIds: string[];
		pageSize: number;
	},
	withModuleColumns: boolean,
) {
	const entries = Object.fromEntries(
		Object.entries(filterKinds).map(([id, kind]) => [
			id,
			v.exactOptional(
				v.pipe(
					v.array(kind.value),
					v.minLength(1),
					v.maxLength(kind.range ? listLimits.ranges : listLimits.values),
				),
			),
		]),
	);
	const filters = withModuleColumns
		? v.pipe(
				v.objectWithRest(entries, anyFilterValues),
				v.check(
					(given) => Object.keys(given).every((id) => id in entries || v.is(anyModuleColumn, id)),
					m.common_error_generic,
				),
			)
		: v.strictObject(entries);
	const sortId = withModuleColumns
		? v.union([v.picklist(sortIds), anyModuleColumn])
		: v.picklist(sortIds);
	const whereEntries = {
		q: v.pipe(v.string(), v.maxLength(listLimits.search)),
		filters,
	};
	const query = v.pipe(
		v.strictObject({
			...whereEntries,
			sort: v.pipe(
				v.array(v.strictObject({ id: sortId, desc: v.boolean() })),
				v.check(
					(sort) => new Set(sort.map((item) => item.id)).size === sort.length,
					m.common_error_generic,
				),
			),
			group: v.nullable(v.picklist(groupIds)),
			pageIndex: wholeIn({ max: listLimits.pageIndex }),
			pageSize: v.literal(pageSize),
		}),
		v.check((input) => jsonBytes(input) <= listLimits.bytes, m.common_error_generic),
	);
	const where = v.pipe(
		v.strictObject(whereEntries),
		v.check((input) => jsonBytes(input) <= listLimits.bytes, m.common_error_generic),
	);
	return { query, where };
}

/** The lists `extendList()` made, by the list and the ids of the columns added. */
const extended = new WeakMap<object, Map<string, List<any>>>();

/**
 * The list with the modules' `columns` added (see `module-columns.ts`), for the tenant that has
 * them: the same list for the same columns, so its URL spec and schemas stay the same objects. Its
 * type is the list's own: the core's code never names a module's column. Without columns, the
 * list itself. Throws when a column's id or URL name clashes with another column's.
 */
export function extendList<C>(list: List<C>, columns: readonly ModuleListColumn[]): List<C> {
	if (!columns.length) return list;
	const key = columns.map((column) => column.id).join(" ");
	let lists = extended.get(list);
	if (!lists) extended.set(list, (lists = new Map()));
	const found = lists.get(key);
	if (found) return found;

	const own = list.definition.columns;
	for (const column of columns) {
		if (!moduleColumnIdPattern.test(column.id) || column.id in own) {
			throw new Error(`A module's column can't be called "${column.id}"`);
		}
	}
	const merged = defineList<ListColumns, ListMode>({
		...(list.definition as ListDef<ListColumns>),
		columns: {
			...own,
			...Object.fromEntries(
				columns.map((column) => [
					column.id,
					{
						param: column.param,
						...(column.sort ? { sort: true } : {}),
						...(column.filter ? { filter: column.filter } : {}),
					},
				]),
			),
		},
	}) as unknown as List<C>;
	const result = { ...merged, moduleColumns: [...list.moduleColumns, ...columns] };
	lists.set(key, result);
	return result;
}

/** Sorts values; `null` (rows without one, see `orNone`) first, ranges by their start, then end. */
function compare(a: unknown, b: unknown): number {
	if (a === b) return 0;
	if (a === null) return -1;
	if (b === null) return 1;
	if (typeof a === "object" && typeof b === "object") {
		const [x, y] = [a as Range<unknown>, b as Range<unknown>];
		return compare(x.from, y.from) || compare(x.to, y.to);
	}
	return (a as any) < (b as any) ? -1 : 1;
}

/**
 * The canonical query for a table's state (read from the URL, or the table's own): a query that
 * passes the schema, the same for the states that mean the same, as SvelteKit caches a query by its
 * argument. Where the URL is lenient this ends it: filter values that are not valid are left out,
 * the others are deduped and sorted, empty filters are dropped, the search is trimmed and what
 * doesn't fit the limits (`listLimits`) is cut off. It's the first page's: `startingAt()` makes
 * another's.
 */
export function toListQuery<C>(list: List<C>, state: TableUrlState): ListQuery<C> {
	const filters: Record<string, unknown[]> = {};
	for (const [id, kind] of Object.entries(list.filterKinds)) {
		const tokens = filterValues(state, id);
		if (!tokens) continue;
		const valid = tokens
			.map((token) => kind.fromUrl(String(token)))
			.filter((x) => v.is(kind.value, x));
		// Deduped (ranges by their ends) and in order.
		const unique = [...new Map(valid.map((value) => [JSON.stringify(value), value])).values()];
		const limit = kind.range ? listLimits.ranges : listLimits.values;
		const values = unique.sort(compare).slice(0, limit);
		if (values.length) filters[id] = values;
	}

	const seen = new Set<string>();
	const sort = state.sorting.flatMap(({ id, desc }) => {
		if (!list.sortIds.includes(id) || seen.has(id)) return [];
		seen.add(id);
		return [{ id, desc }];
	});

	const result = {
		q: state.globalFilter.trim().slice(0, listLimits.search),
		filters,
		sort,
		group: state.grouping.find((id) => list.groupIds.includes(id)) ?? null,
		pageIndex: 0,
		pageSize: list.pageSize,
	};

	// Too big: drop values from the filter with the most, the last ones first.
	while (jsonBytes(result) > listLimits.bytes) {
		const fullest = Object.entries(filters).reduce<[string, unknown[]] | undefined>(
			(best, entry) => (!best || entry[1].length >= best[1].length ? entry : best),
			undefined,
		);
		if (!fullest) break;
		fullest[1].pop();
		if (!fullest[1].length) delete filters[fullest[0]];
	}
	return result as ListQuery<C>;
}

/**
 * The query for the page with the row at `position` (0-based, among all the rows that match), e.g.
 * where a link says the rows were scrolled to (`parseTablePosition()`).
 */
export function startingAt<C>(query: ListQuery<C>, position: number): ListQuery<C> {
	const pageIndex = Number.isSafeInteger(position)
		? Math.min(Math.max(Math.floor(position / query.pageSize), 0), listLimits.pageIndex)
		: 0;
	return pageIndex === query.pageIndex ? query : { ...query, pageIndex };
}

/** The part of a query that decides which rows match. */
export const whereOf = <C>({ q, filters }: ListQuery<C>): ListWhere<C> => ({ q, filters });

/**
 * A stable string for a query (its keys sorted), to tell whether two are the same, e.g. whether
 * the rows a table shows are for its current state.
 */
export function queryKey(query: ListWhere<unknown>): string {
	return JSON.stringify(query, (_, value: unknown) =>
		value && typeof value === "object" && !Array.isArray(value)
			? Object.fromEntries(Object.entries(value).sort(([a], [b]) => compare(a, b)))
			: value,
	);
}
