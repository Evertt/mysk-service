/**
 * A data table's state in the URL: what it's filtered, searched, sorted and grouped by, and where
 * its rows were scrolled to. Pure, so the server can read the same parameters (e.g. a remote query that filters,
 * sorts and pages in the database) as the table writes.
 *
 * The grammar, for a table whose columns `status`, `priority` and `scheduled` (see `param`) can
 * be filtered or sorted by:
 *
 * | Parameter                   | Means                                                         |
 * | --------------------------- | ------------------------------------------------------------- |
 * | `?q=boiler`                 | the search (the global filter)                                |
 * | `?status=quote,scheduled`   | a column filter: keeps rows with any of these values          |
 * | `?status=quote&status=paid` | the same, repeated (read, never written)                      |
 * | `?status=`                  | no filter on the column, when the table has one by default   |
 * | `?engineer=none,12`         | rows without a value (`none`, see `noneToken`) or with one    |
 * | `?scheduled=none,this-week` | a range filter: rows in any of the ranges, or without a value |
 * | `?sort=-priority,scheduled` | sorted by priority descending (`-`), then scheduled ascending |
 * | `?sort=`                    | unsorted, when the table is sorted by default                 |
 * | `?group=category`           | rows grouped by category (one column, see `groupable`)        |
 * | `?group=`                   | not grouped, when the table is grouped by default             |
 * | `?row=121`                  | scrolled to the 121st row (1-based; see `parseTablePosition`) |
 *
 * - A value with a comma or backslash in it escapes them with a backslash: `Smith\, Jones`.
 * - A range filter (`dateRange`, `numberRange`, `moneyRange`) takes ranges, both ends included,
 *   and on a column that can be empty `none`: `2026-10-01..2026-10-07`, `2026-10-01..` (on or
 *   after), `..2026-10-07` (on or before), one day `2026-10-01`, or a preset that stays relative,
 *   on its own (`this-week`) or as an end (`today..`, `this-week..next-month`); numbers `5..10`,
 *   `..10`, `5..` or `5`; money in euros, `500..`, `..12.50`. See `ranges.ts`.
 * - Parameters that match the table's defaults are left out, so an untouched table has a clean
 *   URL; an absent parameter means the default.
 * - Unknown columns, values a column doesn't have, and malformed numbers are ignored (the default
 *   applies), never an error. Other parameters on the page are kept as they are.
 * - With a `prefix`, every parameter gets it: `orders.status=quote`, `orders.sort=number` (for a page
 *   with more than one table).
 * - The rows scroll rather than page (see `scroll-window.svelte.ts`): `row` is only where they were
 *   scrolled to, kept up to date while scrolling and read when the table opens. It isn't part of
 *   the state (`TableUrlState`), and any change of the state drops it: other rows start at the top.
 *   Links from before the rows scrolled may still say `page` and `size`, which are ignored.
 */
import { isRangeToken, type RangeGrammar } from "./ranges.ts";

/** The parts of a table's state that live in the URL, shaped like TanStack Table's. */
export interface TableUrlState {
	/** The search box. */
	globalFilter: string;
	/** By precedence. */
	sorting: { id: string; desc: boolean }[];
	/** Per filtered column, the values to keep (a `string[]` for a `set` filter). */
	columnFilters: { id: string; value: unknown }[];
	/** The column the rows are grouped by, if any: at most one id. */
	grouping: string[];
}

/** A column that can be filtered or sorted by through the URL. */
interface TableUrlColumn {
	/** The column's id in the table. */
	id: string;
	/**
	 * Its name in the URL, as a filter parameter and in `sort`, if not its id: short and lower
	 * case, e.g. `scheduled` for `scheduledFor`.
	 */
	param?: string;
	/** Whether `?sort=` can name it. */
	sortable?: boolean;
	/** Whether `?group=` can name it. */
	groupable?: boolean;
	/**
	 * Its filter's kind, if it has one in the URL: `set` keeps rows with any of the values, a range
	 * kind (`dateRange`, `numberRange`, `moneyRange`) the rows in any of its ranges (or without a
	 * value, for `none`; see `ranges.ts`).
	 */
	filter?: "set" | RangeGrammar;
	/** The values its filter accepts (others in the URL are ignored); any if not given. */
	values?: readonly string[];
	/**
	 * For a range filter, whether it takes `none`, the rows without a value (a column that can be
	 * empty); else `none` is ignored like any other token that isn't a range.
	 */
	none?: boolean;
}

/** How a table's state maps onto the URL. */
export interface TableUrlSpec {
	columns: readonly TableUrlColumn[];
	/** Put before every parameter, with a dot: `orders` gives `orders.sort`. */
	prefix?: string;
	/** The table's state when its parameters are absent; left out of the URL when matched. */
	defaults?: Partial<TableUrlState>;
}

/** A URL's parameters, e.g. SvelteKit's `page.url.searchParams` or `URLSearchParams`. */
export interface SearchParams extends Iterable<[string, string]> {
	get(name: string): string | null;
	getAll(name: string): string[];
}

/** The parameter that says where the rows were scrolled to (see `parseTablePosition`). */
const positionParam = "row";

/** The parameters that aren't columns. */
const reserved = ["q", "sort", "group", positionParam];

/**
 * A filter's value for rows without one (`?engineer=none`): a column that can be empty offers it
 * as an option (`FacetedFilter`'s and `RecordFilter`'s `none`, `orNone()` in a server-side list's
 * definition). It can't be a real value: ids are digits, codes and serial numbers upper case.
 */
export const noneToken = "none";

const emptyState: TableUrlState = {
	globalFilter: "",
	sorting: [],
	columnFilters: [],
	grouping: [],
};

interface Compiled {
	key: (name: string) => string;
	defaults: TableUrlState;
	/** Sortable columns by their name in the URL, and their names by id. */
	sortByParam: Map<string, TableUrlColumn>;
	sortParamById: Map<string, string>;
	/** Groupable columns by their name in the URL, and their names by id. */
	groupByParam: Map<string, TableUrlColumn>;
	groupParamById: Map<string, string>;
	/** Filtered columns, with their parameter (prefixed). */
	filters: { column: TableUrlColumn; key: string }[];
}

const compiled = new WeakMap<TableUrlSpec, Compiled>();

/**
 * Checks a spec once and indexes it. Names that collide are a programming error, so they throw.
 */
function compile(spec: TableUrlSpec): Compiled {
	const cached = compiled.get(spec);
	if (cached) return cached;

	const key = (name: string) => (spec.prefix ? `${spec.prefix}.${name}` : name);
	const sortByParam = new Map<string, TableUrlColumn>();
	const sortParamById = new Map<string, string>();
	const groupByParam = new Map<string, TableUrlColumn>();
	const groupParamById = new Map<string, string>();
	const filters: Compiled["filters"] = [];
	const filterParams = new Set(reserved);
	for (const column of spec.columns) {
		const param = column.param ?? column.id;
		if (!param || /^-|[,\\\s]/.test(param)) {
			throw new Error(`Column "${column.id}" can't be called "${param}" in the URL`);
		}
		if (column.sortable) {
			if (sortByParam.has(param)) throw new Error(`Two sortable columns are called "${param}"`);
			sortByParam.set(param, column);
			sortParamById.set(column.id, param);
		}
		if (column.groupable) {
			if (groupByParam.has(param)) throw new Error(`Two groupable columns are called "${param}"`);
			groupByParam.set(param, column);
			groupParamById.set(column.id, param);
		}
		if (column.filter) {
			if (filterParams.has(param)) throw new Error(`The filter "${param}" is taken`);
			filterParams.add(param);
			filters.push({ column, key: key(param) });
		}
	}

	const defaults: TableUrlState = { ...emptyState, ...spec.defaults };
	const result: Compiled = {
		key,
		defaults,
		sortByParam,
		sortParamById,
		groupByParam,
		groupParamById,
		filters,
	};
	compiled.set(spec, result);
	return result;
}

/** Splits a filter parameter's values on the commas that aren't escaped. */
export function splitValues(raw: string): string[] {
	const values: string[] = [];
	let current = "";
	for (let i = 0; i < raw.length; i++) {
		const char = raw[i];
		if (char === "\\" && i + 1 < raw.length) current += raw[++i];
		else if (char === ",") {
			values.push(current);
			current = "";
		} else current += char;
	}
	values.push(current);
	return values;
}

/** Joins values into a filter parameter, escaping their commas and backslashes. */
export function joinValues(values: readonly string[]): string {
	return values.map((value) => value.replace(/[\\,]/g, (char) => `\\${char}`)).join(",");
}

/** A column filter's values in a state, or `undefined` if it isn't filtered. */
export function filterValues(state: Pick<TableUrlState, "columnFilters">, id: string) {
	const value = state.columnFilters.find((filter) => filter.id === id)?.value;
	return Array.isArray(value) && value.length ? (value as string[]) : undefined;
}

/** A positive whole number, or `undefined`. */
function positive(raw: string | null) {
	if (raw === null || !/^\d{1,9}$/.test(raw.trim())) return undefined;
	const number = Number(raw.trim());
	return number > 0 ? number : undefined;
}

/** Whether a column's filter takes a value from the URL. */
function accepts(column: TableUrlColumn, value: string) {
	if (column.filter && column.filter !== "set") {
		const token = value.trim();
		return token === noneToken ? column.none === true : isRangeToken(column.filter, token);
	}
	return !column.values || column.values.includes(value);
}

/** Reads a table's state from the URL's parameters; what's absent or invalid is the default. */
export function parseTableUrl(params: SearchParams, spec: TableUrlSpec): TableUrlState {
	const { key, defaults, sortByParam, groupByParam, filters } = compile(spec);

	const q = params.get(key("q"));
	const globalFilter = q ?? defaults.globalFilter;

	let sorting = defaults.sorting;
	const sort = params.get(key("sort"));
	if (sort !== null && sort.trim() === "") sorting = [];
	else if (sort !== null) {
		const seen = new Set<string>();
		const parsed = sort.split(",").flatMap((token) => {
			const name = token.trim().replace(/^-/, "");
			const column = sortByParam.get(name);
			if (!column || seen.has(column.id)) return [];
			seen.add(column.id);
			return [{ id: column.id, desc: token.trim().startsWith("-") }];
		});
		if (parsed.length) sorting = parsed;
	}

	const columnFilters = defaults.columnFilters.filter(
		(filter) => !filters.some(({ column }) => column.id === filter.id),
	);
	for (const { column, key: param } of filters) {
		const raw = params.getAll(param);
		let values = filterValues(defaults, column.id);
		if (raw.length && raw.every((value) => value.trim() === "")) values = undefined;
		else if (raw.length) {
			const parsed = [
				...new Set(raw.flatMap(splitValues).filter((value) => value.trim() !== "")),
			].filter((value) => accepts(column, value));
			if (parsed.length) values = parsed;
		}
		if (values) columnFilters.push({ id: column.id, value: values });
	}

	let grouping = defaults.grouping;
	const group = params.get(key("group"));
	if (group !== null && group.trim() === "") grouping = [];
	else if (group !== null) {
		const column = groupByParam.get(group.trim());
		if (column) grouping = [column.id];
	}

	return { globalFilter, sorting, columnFilters, grouping };
}

/**
 * Where the URL says the table's rows were scrolled to: the 0-based index of the first row that
 * was in view, among all the rows that match (`?row=121` is 120), or 0.
 */
export function parseTablePosition(params: SearchParams, spec: TableUrlSpec): number {
	const row = positive(params.get(compile(spec).key(positionParam)));
	return row ? row - 1 : 0;
}

/** The URL's parameters with the table's position (see `parseTablePosition`) set, or left out at 0. */
export function writeTablePosition(
	params: SearchParams,
	position: number,
	spec: TableUrlSpec,
): URLSearchParams {
	const next = new URLSearchParams([...params]);
	const param = compile(spec).key(positionParam);
	if (position > 0) next.set(param, String(position + 1));
	else next.delete(param);
	return next;
}

const sameSorting = (a: TableUrlState["sorting"], b: TableUrlState["sorting"]) =>
	a.length === b.length && a.every((sort, i) => sort.id === b[i].id && sort.desc === b[i].desc);

const sameValues = (a: readonly string[] = [], b: readonly string[] = []) =>
	a.length === b.length && a.every((value) => b.includes(value));

/** The table's own parameters for a state, in a fixed order, without the defaults. */
function ownParams(state: TableUrlState, spec: TableUrlSpec): [string, string][] {
	const { key, defaults, sortParamById, groupParamById, filters } = compile(spec);
	const own: [string, string][] = [];

	if (state.globalFilter !== defaults.globalFilter) own.push([key("q"), state.globalFilter]);
	for (const { column, key: param } of filters) {
		const values = filterValues(state, column.id);
		if (!sameValues(values, filterValues(defaults, column.id))) {
			own.push([param, joinValues(values ?? [])]);
		}
	}
	const sorting = state.sorting.filter((sort) => sortParamById.has(sort.id));
	if (!sameSorting(sorting, defaults.sorting)) {
		const tokens = sorting.map((sort) => `${sort.desc ? "-" : ""}${sortParamById.get(sort.id)}`);
		own.push([key("sort"), tokens.join(",")]);
	}
	const group = state.grouping.find((id) => groupParamById.has(id));
	if (group !== defaults.grouping.find((id) => groupParamById.has(id))) {
		own.push([key("group"), group ? groupParamById.get(group)! : ""]);
	}
	return own;
}

/** Every parameter the table reads (prefixed). */
export function tableUrlParams(spec: TableUrlSpec): string[] {
	const { key, filters } = compile(spec);
	return [...reserved.map(key), ...filters.map((filter) => filter.key)];
}

/**
 * The URL's parameters with the table's replaced by those for `state`: the others are kept, the
 * table's follow them, and defaults are left out. The position (`row`) goes: other rows start at
 * the top.
 */
export function writeTableUrl(
	params: SearchParams,
	state: TableUrlState,
	spec: TableUrlSpec,
): URLSearchParams {
	const next = new URLSearchParams([...params]);
	for (const param of tableUrlParams(spec)) next.delete(param);
	for (const [param, value] of ownParams(state, spec)) next.append(param, value);
	return next;
}

/**
 * A state's parameters as one string, the same for states that give the same URL: compare these
 * to tell whether the URL needs to change.
 */
export function tableUrlKey(state: TableUrlState, spec: TableUrlSpec): string {
	return searchString(new URLSearchParams(ownParams(state, spec)));
}

/** Encodes a parameter's name or value, but keeps commas and spaces (as `+`) readable. */
const encode = (text: string) =>
	encodeURIComponent(text).replace(/%2C/gi, ",").replace(/%20/g, "+");

/**
 * Parameters as a URL's search (`?status=quote,scheduled`, or `""` for none), with commas left
 * readable, unlike `URLSearchParams.toString()` (which writes `%2C`).
 */
export function searchString(params: URLSearchParams): string {
	const pairs = [...params].map(([name, value]) => `${encode(name)}=${encode(value)}`);
	return pairs.length ? `?${pairs.join("&")}` : "";
}
