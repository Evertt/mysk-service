/**
 * A data table's state in the URL: what it's filtered, searched and sorted by, and which page it
 * shows. Pure, so the server can read the same parameters (e.g. a remote query that filters,
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
 * | `?sort=-priority,scheduled` | sorted by priority descending (`-`), then scheduled ascending |
 * | `?sort=`                    | unsorted, when the table is sorted by default                 |
 * | `?page=2`                   | the second page (1-based)                                     |
 * | `?size=50`                  | 50 rows per page                                              |
 *
 * - A value with a comma or backslash in it escapes them with a backslash: `Smith\, Jones`.
 * - Parameters that match the table's defaults are left out, so an untouched table has a clean
 *   URL; an absent parameter means the default.
 * - Unknown columns, values a column doesn't have, and malformed numbers are ignored (the default
 *   applies), never an error. Other parameters on the page are kept as they are.
 * - With a `prefix`, every parameter gets it: `orders.status=quote`, `orders.page=2` (for a page
 *   with more than one table).
 */

/** The parts of a table's state that live in the URL, shaped like TanStack Table's. */
export interface TableUrlState {
	/** The search box. */
	globalFilter: string;
	/** By precedence. */
	sorting: { id: string; desc: boolean }[];
	/** Per filtered column, the values to keep (a `string[]` for a `set` filter). */
	columnFilters: { id: string; value: unknown }[];
	/** `pageIndex` is 0-based. */
	pagination: { pageIndex: number; pageSize: number };
}

/** A column that can be filtered or sorted by through the URL. */
export interface TableUrlColumn {
	/** The column's id in the table. */
	id: string;
	/**
	 * Its name in the URL, as a filter parameter and in `sort`, if not its id: short and lower
	 * case, e.g. `scheduled` for `scheduledFor`.
	 */
	param?: string;
	/** Whether `?sort=` can name it. */
	sortable?: boolean;
	/** Its filter's kind, if it has one in the URL: `set` keeps rows with any of the values. */
	filter?: "set";
	/** The values its filter accepts (others in the URL are ignored); any if not given. */
	values?: readonly string[];
}

/** How a table's state maps onto the URL. */
export interface TableUrlSpec {
	columns: readonly TableUrlColumn[];
	/** Put before every parameter, with a dot: `orders` gives `orders.page`. */
	prefix?: string;
	/** The table's state when its parameters are absent; left out of the URL when matched. */
	defaults?: Partial<TableUrlState>;
	/** The page sizes `size` accepts, besides the default size. */
	pageSizes?: readonly number[];
}

/** A URL's parameters, e.g. SvelteKit's `page.url.searchParams` or `URLSearchParams`. */
export interface SearchParams extends Iterable<[string, string]> {
	get(name: string): string | null;
	getAll(name: string): string[];
}

/** The page sizes the tables offer (and `size` accepts), unless they say otherwise. */
export const defaultPageSizes: readonly number[] = [10, 20, 50, 100];

/** The parameters that aren't columns. */
const reserved = ["q", "sort", "page", "size"];

const emptyState: TableUrlState = {
	globalFilter: "",
	sorting: [],
	columnFilters: [],
	pagination: { pageIndex: 0, pageSize: 20 },
};

interface Compiled {
	key: (name: string) => string;
	defaults: TableUrlState;
	pageSizes: readonly number[];
	/** Sortable columns by their name in the URL, and their names by id. */
	sortByParam: Map<string, TableUrlColumn>;
	sortParamById: Map<string, string>;
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
		if (column.filter) {
			if (filterParams.has(param)) throw new Error(`The filter "${param}" is taken`);
			filterParams.add(param);
			filters.push({ column, key: key(param) });
		}
	}

	const defaults: TableUrlState = {
		...emptyState,
		...spec.defaults,
		pagination: { ...emptyState.pagination, ...spec.defaults?.pagination },
	};
	const result: Compiled = {
		key,
		defaults,
		pageSizes: spec.pageSizes ?? defaultPageSizes,
		sortByParam,
		sortParamById,
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

/** Reads a table's state from the URL's parameters; what's absent or invalid is the default. */
export function parseTableUrl(params: SearchParams, spec: TableUrlSpec): TableUrlState {
	const { key, defaults, pageSizes, sortByParam, filters } = compile(spec);

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
			].filter((value) => !column.values || column.values.includes(value));
			if (parsed.length) values = parsed;
		}
		if (values) columnFilters.push({ id: column.id, value: values });
	}

	const size = positive(params.get(key("size")));
	const pageSize =
		size && (size === defaults.pagination.pageSize || pageSizes.includes(size))
			? size
			: defaults.pagination.pageSize;
	const page = positive(params.get(key("page")));
	const pageIndex = page ? page - 1 : defaults.pagination.pageIndex;

	return { globalFilter, sorting, columnFilters, pagination: { pageIndex, pageSize } };
}

const sameSorting = (a: TableUrlState["sorting"], b: TableUrlState["sorting"]) =>
	a.length === b.length && a.every((sort, i) => sort.id === b[i].id && sort.desc === b[i].desc);

const sameValues = (a: readonly string[] = [], b: readonly string[] = []) =>
	a.length === b.length && a.every((value) => b.includes(value));

/** The table's own parameters for a state, in a fixed order, without the defaults. */
function ownParams(state: TableUrlState, spec: TableUrlSpec): [string, string][] {
	const { key, defaults, sortParamById, filters } = compile(spec);
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
	if (state.pagination.pageIndex !== defaults.pagination.pageIndex) {
		own.push([key("page"), String(state.pagination.pageIndex + 1)]);
	}
	if (state.pagination.pageSize !== defaults.pagination.pageSize) {
		own.push([key("size"), String(state.pagination.pageSize)]);
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
 * table's follow them, and defaults are left out.
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
