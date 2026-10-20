/**
 * The client side of a server-side table (see `#lib/server/lists/plan.ts`): the page reads the
 * table's state from the URL into the list's query and asks its remote queries for the first page
 * of rows (the query) and its filters' counts (its `whereOf()`), so the URL (which the table keeps
 * in sync, debouncing the search) decides what's fetched (`listQueries()`). The table
 * (`createServerTable()`) loads the pages after it as it's scrolled (`scrollPages()`), and shows
 * the rows as they come (`createAppTable` with `serverSide`); `isStale()` and
 * `serverTableLoading()` tell whether they are the table's.
 */
import type { RemoteQuery } from "$app/server";
import { navigating, page } from "$app/state";
import type { RowData, SvelteTable } from "@tanstack/svelte-table";
import { getContext, setContext, untrack } from "svelte";

import type { Features } from "./features.ts";
import type { PageGroups } from "./grouping.ts";
import {
	type FilterId,
	type List,
	type ListQuery,
	type ListWhere,
	queryKey,
	startingAt,
	toListQuery,
	whereOf,
} from "./list-definition.ts";
import type { ScrollWindow } from "./scroll-window.svelte.ts";
import { type AppTableOptions, createAppTable, type ListTable } from "./table.svelte.ts";
import { parseTablePosition, parseTableUrl, type TableUrlSpec } from "./url-state.ts";

/**
 * What a URL spec makes of URLs: its sortable, groupable and filtered columns, with their names
 * in the URL, and its defaults. A list's table's spec (from its columns, see `tableUrlSpec`) and
 * its list's (`urlSpec`, from the definition) agree on it, as its columns take theirs from the
 * definition (`withListColumns()`).
 */
export function urlGrammar(spec: TableUrlSpec) {
	return {
		columns: spec.columns
			.filter((column) => column.sortable || column.groupable || column.filter)
			.map((column) => ({
				id: column.id,
				param: column.param ?? column.id,
				sortable: Boolean(column.sortable),
				groupable: Boolean(column.groupable),
				filter: column.filter,
				values: column.values && [...column.values],
				none: Boolean(column.none),
			})),
		defaults: parseTableUrl(new URLSearchParams(), spec),
	};
}

/**
 * Whether the rows a server-side table shows are for another state than the table's: its search,
 * filters, sorting or grouping changed, and the rows for them haven't come yet. `key` is the one
 * of the rows' first page (`ScrollPages.key`).
 */
function isStale<TData extends RowData>(
	table: SvelteTable<Features, TData>,
	list: List<any>,
	key: string,
) {
	const state = {
		globalFilter: table.atoms.globalFilter.get() ?? "",
		sorting: table.atoms.sorting.get(),
		columnFilters: table.atoms.columnFilters.get(),
		grouping: table.atoms.grouping.get(),
	};
	return queryKey(toListQuery(list, state)) !== key;
}

/**
 * Whether a server-side table is waiting for rows (pass to `<table.Table {loading}>`): from when
 * its search, filters, sorting or grouping change until the rows for them are in, and while a
 * change to the URL (e.g. going back) waits for them, which only then reaches the table. `key` is
 * the one the rows came with (`ScrollPages.key`). Call it while the component initializes.
 *
 * It compares the rows' key with what the table and a navigation under way ask for, rather than
 * counting pending work with `$effect.pending()`: Svelte (5.57) keeps whatever reads that alive
 * after it's gone, and with it the table, and in development navigating from such a page to the
 * dashboard's charts hangs the tab.
 */
function serverTableLoading<TData extends RowData>(
	table: SvelteTable<Features, TData>,
	list: List<any>,
	key: () => string,
) {
	const pathname = page.url.pathname;
	/** A navigation to this page (e.g. going back) under way, for other rows than these. */
	const arriving = $derived.by(() => {
		const url = navigating.to?.url;
		if (!url || url.pathname !== pathname) return false;
		return queryKey(toListQuery(list, parseTableUrl(url.searchParams, list.urlSpec))) !== key();
	});
	const loading = $derived(arriving || isStale(table, list, key()));
	return {
		get current() {
			return loading;
		},
	};
}

/** An option of a filter on related records (`RecordFilter`), e.g. a customer. */
export interface RecordOption {
	/** The filter value, e.g. a customer's code. */
	value: string;
	label: string;
	/** Shown under the label, e.g. a unit's serial number. */
	detail?: string;
	/** How many of the list's rows have it, of those its search and other filters leave. */
	count?: number;
}

/**
 * What a `RecordFilter` loads (`facetOptions()` on the server): the options matching its search,
 * most rows first, and the ticked ones.
 */
export interface RecordOptions {
	/** Those that match the search, the first so many. */
	options: RecordOption[];
	/** The ticked ones, by name (those that exist). */
	selected: RecordOption[];
	/** Whether more match than `options` has. */
	more: boolean;
	/** For a column that can be empty: how many rows have no value. */
	none?: number;
}

/** What a `RecordFilter` loads its options with. */
export type LoadRecordOptions = (input: {
	search: string;
	selected: string[];
}) => PromiseLike<RecordOptions>;

/**
 * A `RecordFilter`'s `load` on a server-side list: the list's options query for the filter (e.g.
 * `getOrderCustomerOptions`, made with `facetOptions()`), asked with the list's search and filters
 * (`where`, e.g. `whereOf()` of the rows' query), for the counts and their order to be those of the
 * rows the other filters leave. `current` is a new function when they change (but for the filter's
 * own values, which its counts don't depend on), so the filter fetches its options again.
 */
export function recordOptions<C>(
	query: (input: {
		where: ListWhere<C>;
		search: string;
		selected: string[];
	}) => PromiseLike<RecordOptions>,
	where: () => ListWhere<C>,
	columnId: FilterId<C>,
) {
	const others = $derived.by((): ListWhere<C> => {
		const { q, filters } = where();
		const { [columnId]: _own, ...rest } = filters;
		return { q, filters: rest as ListWhere<C>["filters"] };
	});
	const key = $derived(queryKey(others));
	const load = $derived.by((): LoadRecordOptions => {
		void key;
		const current = untrack(() => others);
		return (input) => query({ ...input, where: current });
	});
	return {
		get current() {
			return load;
		},
	};
}

/**
 * The query for a server-side list's rows, as the page's URL says (`list` may be one the tenant's
 * modules extended): the first page to show, the one with the row the URL says the table was
 * scrolled to (`?row=`, see `parseTablePosition`). Only a change of the search, filters, sorting or
 * grouping makes another query: the position, which the table keeps in the URL while it's
 * scrolled, is read when they change (or the page opens), not as it changes. Call it while the
 * page initializes, and ask for the rows with `current`.
 */
function urlListQuery<C>(list: () => List<C>) {
	const base = $derived(toListQuery(list(), parseTableUrl(page.url.searchParams, list().urlSpec)));
	const key = $derived(queryKey(base));
	const query = $derived.by(() => {
		void key;
		return untrack(() =>
			startingAt(base, parseTablePosition(page.url.searchParams, list().urlSpec)),
		);
	});
	return {
		get current() {
			return query;
		},
	};
}

/** What a server-side list's rows query answers for a page (e.g. `getOrders()`). */
export interface ListPage<Row, Query> {
	rows: Row[];
	/** How many rows match in all. */
	rowCount: number;
	/** The query the rows are for. */
	query: Query;
	/** The same as a string (`queryKey`). */
	key: string;
	/** When grouped, what the server knows of the page's groups. */
	groups?: PageGroups<Row>;
}

/** A server-side table's rows as it's scrolled: see `scrollPages`. */
export interface ScrollPages<Row, Query> extends ScrollWindow {
	/** The rows of the pages loaded, in order. */
	readonly rows: Row[];
	/** How many rows match in all. */
	readonly rowCount: number;
	/** What the server knows of the loaded rows' groups, when grouped. */
	readonly groups: PageGroups<Row> | undefined;
	/** The query of the page a row was loaded with (e.g. to update it optimistically). */
	queryOf(id: unknown): Query;
}

/**
 * The rows of a server-side table, page after page as it's scrolled (pass it to `createAppTable`
 * as `scroll`, and its `rows` as the data): `first` is the page the page asked for and awaited
 * (`urlListQuery()`), and `fetch` the rows' remote query, which it asks for the pages after it
 * when the table nears its end, and for those before it when the table opened partway down and
 * nears its start. Call it while the component initializes.
 *
 * The pages are offsets into the list (`ListQuery.pageIndex`), each its own cached query, so a
 * mutation's `updates(getOrders)` refreshes each loaded page in place: no row the reader loaded
 * goes, and nothing moves. A row that moves from one page to the next between two loads (a row
 * added or removed before it) shows once.
 */
export function scrollPages<Page extends ListPage<{ id: unknown }, ListQuery<any>>>({
	first,
	fetch,
}: {
	first: () => Page;
	fetch: (query: Page["query"]) => RemoteQuery<Page>;
}): ScrollPages<Page["rows"][number], Page["query"]> {
	type Row = Page["rows"][number];
	type Query = Page["query"];
	/** The first page's query on page 0: what the rows are for, whatever page they start at. */
	const key = $derived(queryKey(startingAt(first().query, 0)));
	const startPage = $derived(first().query.pageIndex);
	const pageSize = $derived(first().query.pageSize);

	/**
	 * How many pages are asked for before and after the first: none for other rows (or another
	 * first page), even those of a key seen before (going back to them starts over too).
	 */
	let span = $derived({ key, start: startPage, before: 0, after: 0 });

	// The pages' queries, kept while they're the table's (SvelteKit keeps a query as long as it's
	// referenced), by their index.
	let cached = { key: "", queries: new Map<number, RemoteQuery<Page>>() };
	function pageQuery(index: number) {
		if (cached.key !== key) cached = { key, queries: new Map() };
		let found = cached.queries.get(index);
		if (!found) {
			found = fetch({ ...first().query, pageIndex: index });
			cached.queries.set(index, found);
		}
		return found;
	}

	/** The pages asked for, in order, with what they hold so far. */
	const pages = $derived.by(() => {
		const list: { index: number; page?: Page; failed: boolean }[] = [];
		for (let index = startPage - span.before; index <= startPage + span.after; index++) {
			if (index === startPage) {
				list.push({ index, page: first(), failed: false });
				continue;
			}
			const query = pageQuery(index);
			list.push({ index, page: query.current, failed: !!query.error });
		}
		return list;
	});

	/** The pages loaded around the first, which are shown: up to one that isn't in yet. */
	const loaded = $derived.by(() => {
		const at = span.before;
		let from = at;
		while (from > 0 && pages[from - 1].page) from--;
		let to = at;
		while (to < pages.length - 1 && pages[to + 1].page) to++;
		return pages.slice(from, to + 1) as { index: number; page: Page }[];
	});

	const rows = $derived.by(() => {
		const seen = new Set<unknown>();
		const all: Row[] = [];
		for (const { page } of loaded) {
			for (const row of page.rows) {
				if (seen.has(row.id)) continue;
				seen.add(row.id);
				all.push(row);
			}
		}
		return all;
	});

	const rowCount = $derived(first().rowCount);
	const firstLoaded = $derived(loaded[0].index);
	const lastLoaded = $derived(loaded.at(-1)!.index);
	const more = $derived((lastLoaded + 1) * pageSize < rowCount);
	const earlier = $derived(firstLoaded > 0);
	const before = $derived(pages[0]);
	const after = $derived(pages.at(-1)!);
	const loadingMore = $derived(span.after > 0 && !after.page && !after.failed);
	const loadingEarlier = $derived(span.before > 0 && !before.page && !before.failed);

	const scroll: ScrollPages<Row, Query> = {
		get key() {
			return key;
		},
		get start() {
			return firstLoaded * pageSize;
		},
		get step() {
			return pageSize;
		},
		get more() {
			return more;
		},
		get earlier() {
			return earlier;
		},
		get loadingMore() {
			return loadingMore;
		},
		get loadingEarlier() {
			return loadingEarlier;
		},
		loadMore() {
			if (!more || loadingMore) return;
			// A page that failed is asked for again rather than skipped.
			if (span.after > 0 && after.failed) return void pageQuery(after.index).refresh();
			span = { ...span, after: span.after + 1 };
		},
		loadEarlier() {
			if (!earlier || loadingEarlier) return;
			if (span.before > 0 && before.failed) return void pageQuery(before.index).refresh();
			span = { ...span, before: span.before + 1 };
		},
		get rows() {
			return rows;
		},
		get rowCount() {
			return rowCount;
		},
		get groups() {
			const groups = first().groups;
			if (!groups) return undefined;
			return {
				counts: groups.counts,
				previous: loaded[0].page.groups?.previous,
				next: loaded.at(-1)!.page.groups?.next,
			};
		},
		queryOf(id) {
			const found = loaded.find(({ page }) => page.rows.some((row) => row.id === id));
			return found ? found.page.query : first().query;
		},
	};

	// Opened beyond the last row (a link from when there were more): show the rows before it.
	$effect(() => {
		if (!rows.length && earlier && !loadingEarlier) untrack(() => scroll.loadEarlier());
	});

	return scroll;
}

const whereKey = Symbol("list-where");

/**
 * Which rows a server-side list's table shows, its first page's `where` (`createServerTable()`
 * sets it), for the filters inside it that count under the list's search and other filters
 * (`ListToolbar`'s record filters). Call it while a component inside the table initializes.
 */
export function listWhere<C>(): () => ListWhere<C> {
	const where = getContext<(() => ListWhere<C>) | undefined>(whereKey);
	if (!where) throw new Error("A list's record filter needs to be inside a server-side table");
	return where;
}

/** A server-side list's table: see `createServerTable()`. */
export interface ServerTable<
	Row extends { id: unknown },
	C,
	Query = ListQuery<C>,
> extends ListTable<Row, C> {
	/** Its rows as it's scrolled. */
	pages: ScrollPages<Row, Query>;
	/** Which rows it shows (its first page's query's `where`). */
	where: () => ListWhere<C>;
	readonly loading: boolean;
	readonly matching: { where: ListWhere<C>; key: string; count: number };
}

/**
 * The table of a server-side list (`defineList()`): `first` is the page of rows the page asked for
 * and awaited (`listQueries()`), `fetch` the rows' remote query, which it asks for the pages before
 * and after it as it's scrolled (`scrollPages()`). Its columns are the list's (`withListColumns()`),
 * its rows by id, and its state starts at the list's defaults (the server's too). It says whether
 * it waits for rows (`serverTableLoading()`), what the server knows of its groups and which rows
 * match, and gives its filters the rows' `where` (`listWhere()`). Call it while the component
 * initializes.
 */
export function createServerTable<C, Page extends ListPage<{ id: unknown }, ListQuery<C>>>({
	list,
	first,
	fetch,
	columns,
	initialState,
}: {
	/** The list, with the tenant's modules' columns if it takes them (`extendList()`). */
	list: List<C>;
	first: () => Page;
	fetch: (query: Page["query"]) => RemoteQuery<Page>;
	columns: AppTableOptions<Page["rows"][number]>["columns"];
	/** Besides the list's defaults, e.g. the hidden columns. */
	initialState?: AppTableOptions<Page["rows"][number]>["initialState"];
}): ServerTable<Page["rows"][number], C, Page["query"]> {
	type Row = Page["rows"][number];
	const pages = scrollPages({ first, fetch });
	const table = createAppTable<Row>({
		columns,
		serverSide: true,
		scroll: pages,
		get data() {
			return pages.rows;
		},
		get rowCount() {
			return pages.rowCount;
		},
		getRowId: (row) => String(row.id),
		initialState: { ...list.urlSpec.defaults, ...initialState },
	});
	const loading = serverTableLoading(table, list, () => pages.key);
	const where = () => whereOf(first().query);
	setContext(whereKey, where);
	return {
		table,
		list,
		pages,
		where,
		get loading() {
			return loading.current;
		},
		get groups() {
			return pages.groups;
		},
		get matching() {
			const page = first();
			return { where: whereOf(page.query), key: page.key, count: page.rowCount };
		},
	};
}

/**
 * A server-side list page's queries, as the page's URL says (`urlListQuery()`): its rows' first
 * page (`rows`, e.g. `getOrders`) and, if it has them, its filters' counts (`facets`, asked with
 * the query's `where`), which start at once. A change of the search, filters, sorting or grouping
 * asks for them again (the sorting alone, only the rows). Call it while the page initializes, and
 * await `rows` and `facets` for the table (`createServerTable()`).
 *
 * ```ts
 * const orders = listQueries(() => ordersList, getOrders, getOrderFacets);
 * // <OrdersTable orders={await orders.rows} facets={await orders.facets} />
 * ```
 */
export function listQueries<C, Rows, Facets = undefined>(
	list: () => List<C>,
	rows: (query: ListQuery<C>) => Rows,
	facets?: (where: ListWhere<C>) => Facets,
) {
	const listQuery = urlListQuery(list);
	const query = $derived(listQuery.current);
	const where = $derived(whereOf(query));
	const rowsQuery = $derived(rows(query));
	const facetsQuery = $derived(facets?.(where));
	return {
		/** The rows' query: the first page's. */
		get query() {
			return query;
		},
		get rows() {
			return rowsQuery;
		},
		get facets() {
			return facetsQuery as Facets;
		},
	};
}
