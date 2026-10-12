/**
 * A server-side list's definition: one description of what a list sorts, groups and filters by,
 * and with which values, from which the rest follows:
 *
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
 * 		scheduledFor: { param: "scheduled", sort: true, filter: dateRange }, // [{ from, to }]
 * 		createdAt: { param: "created", sort: true },
 * 	},
 * 	defaults: { sort: [{ id: "createdAt", desc: true }], pageSize: 20 },
 * });
 * ```
 *
 * Pure, with no server imports: the page, the table and the server's SQL mapping
 * (`ListSql` in `#lib/server/lists/plan.ts`) all read the same definition.
 */
import * as v from "valibot";

import type { ListColumnsPoint } from "#lib/extensions/define.ts";

import { type ModuleListColumn, moduleColumnIdPattern } from "./module-columns.ts";
import {
	type DateRange,
	dateRangeToken,
	isDay,
	isOrdered,
	isRangeNumber,
	type NumberRange,
	numberRangeToken,
	parseDateRange,
	parseNumberRange,
	type RangeGrammar,
} from "./ranges.ts";
import {
	defaultPageSizes,
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
	/** The values of one filter. */
	values: 50,
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
}

/** A filter on a text, e.g. a customer's code. */
export const code: FilterKind<string> = {
	value: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
	fromUrl: (token) => token,
	toUrl: (value) => value,
};

/** A filter on a record's id (a positive whole number). */
export const id: FilterKind<number> = {
	value: v.pipe(v.number(), v.integer(), v.minValue(1)),
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
});

/** A range's schema: both ends, either may be open (`null`) but not both, in order. */
const rangeOf = <T extends string | number>(end: v.GenericSchema<T>) =>
	v.pipe(
		v.strictObject({ from: v.nullable(end), to: v.nullable(end) }),
		v.check(isOrdered, m.common_error_generic),
	);

/**
 * A filter on a date, by a range of days (`ranges.ts`): `?scheduled=2026-10-01..2026-10-07`,
 * `..2026-10-07` or a preset that stays relative in the URL, `?scheduled=this-week`, which the
 * query has as the days it means when it's built (`toListQuery()`). One range per filter; the SQL
 * keeps the rows in it with `inDays()` (`#lib/server/lists/plan.ts`).
 */
export const dateRange: FilterKind<DateRange> = {
	value: rangeOf(v.custom<string>(isDay)),
	fromUrl: (token) => parseDateRange(token),
	toUrl: dateRangeToken,
	range: "dateRange",
};

/**
 * A filter on a number, by a range: `?quantity=..10` (at most 10), `5..` (at least 5), `5..10`.
 * One range per filter; the SQL keeps the rows in it with `between()`.
 */
export const numberRange: FilterKind<NumberRange> = {
	value: rangeOf(v.custom<number>(isRangeNumber)),
	fromUrl: (token) => parseNumberRange(token),
	toUrl: numberRangeToken,
	range: "numberRange",
};

/** What a column of a list can do. */
interface ListColumn {
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
 * nothing `undefined`, filters without empty ones.
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

/** What a list is made of: its columns and where it starts. */
export interface ListDef<C extends ListColumns> {
	columns: C;
	defaults?: {
		/** The sorting when the URL has none. */
		sort?: readonly { id: SortId<C>; desc: boolean }[];
		group?: GroupId<C>;
		filters?: { [K in FilterId<C>]?: readonly FilterValue<C, K>[] };
		/** The page size when the URL has none; 20 if not given. */
		pageSize?: number;
	};
	/** The page sizes besides the default one; `defaultPageSizes` if not given. */
	pageSizes?: readonly number[];
	/**
	 * The extension point through which modules add columns to the list (see `module-columns.ts`),
	 * if they may.
	 */
	moduleColumns?: ListColumnsPoint;
}

/** A defined list. */
export interface List<C> {
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
	/** The page sizes the query accepts, the default one among them. */
	pageSizes: readonly number[];
	defaultPageSize: number;
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

const defaultPageSize = 20;

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
					}
				: {}),
		})),
		defaults: {
			sorting: (defaults?.sort ?? []).map(({ id, desc }) => ({ id, desc })),
			pagination: { pageIndex: 0, pageSize: defaults?.pageSize ?? defaultPageSize },
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
		...(def.pageSizes ? { pageSizes: def.pageSizes } : {}),
	};
	parseTableUrl(new URLSearchParams(), spec);
	return spec;
}

/** Defines a server-side list from its columns. */
export function defineList<const C extends ListColumns>(def: ListDef<C>): List<C> {
	const columns = Object.entries(def.columns);
	const sortIds = columns.filter(([, column]) => column.sort).map(([id]) => id);
	const groupIds = columns.filter(([, column]) => column.group).map(([id]) => id);
	const filterKinds = Object.fromEntries(
		columns.flatMap(([id, column]) => (column.filter ? [[id, column.filter]] : [])),
	);
	const defaultSize = def.defaults?.pageSize ?? defaultPageSize;
	const pageSizes = [...new Set([...(def.pageSizes ?? defaultPageSizes), defaultSize])];

	const shape = { filterKinds, sortIds, groupIds, pageSizes };
	const strict = listSchemas(shape, false);
	const boundary = def.moduleColumns ? listSchemas(shape, true) : strict;
	return {
		columns: def.columns,
		definition: def as unknown as ListDef<ListColumns>,
		moduleColumns: [],
		filterKinds,
		sortIds,
		groupIds,
		pageSizes,
		defaultPageSize: defaultSize,
		urlSpec: toUrlSpec(def),
		query: boundary.query as unknown as v.GenericSchema<ListQuery<C>>,
		where: boundary.where as unknown as v.GenericSchema<ListWhere<C>>,
		strict: strict as unknown as List<C>["strict"],
		...(def.moduleColumns ? { point: def.moduleColumns } : {}),
	};
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
		pageSizes,
	}: {
		filterKinds: Record<string, FilterKind<any>>;
		sortIds: string[];
		groupIds: string[];
		pageSizes: number[];
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
					// A range filter has one range.
					v.maxLength(kind.range ? 1 : listLimits.values),
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
			pageIndex: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(listLimits.pageIndex)),
			pageSize: v.picklist(pageSizes),
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
	const merged = defineList<ListColumns>({
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

/** Sorts values; `null` (rows without one, see `orNone`) first. */
const compare = (a: unknown, b: unknown) =>
	a === b ? 0 : a === null ? -1 : b === null ? 1 : (a as any) < (b as any) ? -1 : 1;

/**
 * The canonical query for a table's state (read from the URL, or the table's own): a query that
 * passes the schema, the same for the states that mean the same, as SvelteKit caches a query by its
 * argument. Where the URL is lenient this ends it: filter values that are not valid are left out,
 * the others are deduped and sorted, empty filters are dropped, the search is trimmed, a page is
 * one the list has and what doesn't fit the limits (`listLimits`) is cut off.
 */
export function toListQuery<C>(list: List<C>, state: TableUrlState): ListQuery<C> {
	const filters: Record<string, unknown[]> = {};
	for (const [id, kind] of Object.entries(list.filterKinds)) {
		const tokens = filterValues(state, id);
		if (!tokens) continue;
		const valid = tokens
			.map((token) => kind.fromUrl(String(token)))
			.filter((x) => v.is(kind.value, x));
		// A range filter has one range, the first; a set its values deduped and in order.
		const values = kind.range
			? valid.slice(0, 1)
			: [...new Set(valid)].sort(compare).slice(0, listLimits.values);
		if (values.length) filters[id] = values;
	}

	const seen = new Set<string>();
	const sort = state.sorting.flatMap(({ id, desc }) => {
		if (!list.sortIds.includes(id) || seen.has(id)) return [];
		seen.add(id);
		return [{ id, desc }];
	});

	const { pageIndex, pageSize } = state.pagination;
	const result = {
		q: state.globalFilter.trim().slice(0, listLimits.search),
		filters,
		sort,
		group: state.grouping.find((id) => list.groupIds.includes(id)) ?? null,
		pageIndex: Number.isSafeInteger(pageIndex)
			? Math.min(Math.max(pageIndex, 0), listLimits.pageIndex)
			: 0,
		pageSize: list.pageSizes.includes(pageSize) ? pageSize : list.defaultPageSize,
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
