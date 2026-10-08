import { goto } from "$app/navigation";
import { page } from "$app/state";
import type { RowData, SvelteTable } from "@tanstack/svelte-table";
import { untrack } from "svelte";

import type { Features } from "./features.js";
import {
	parseTableUrl,
	searchString,
	tableUrlKey,
	type TableUrlSpec,
	type TableUrlState,
	writeTableUrl,
} from "./url-state.js";
import { tableViewsKey } from "./views.js";

/** How a table keeps its state in the URL (see `url-state.ts` for the grammar). */
export interface UrlStateOptions {
	/** Put before the table's parameters, for a page with more than one table: `orders.page`. */
	prefix?: string;
	/** The page sizes `?size=` accepts, if not the usual ones. */
	pageSizes?: readonly number[];
}

type Table<TData extends RowData> = SvelteTable<Features, TData>;

/** How long typing in the search box waits before the URL follows. */
const searchDelay = 300;

/**
 * The URL spec of a table, from its columns: their `meta.param` names them, sortable columns can
 * be sorted by, and those with a `oneOf` filter (or `meta.filter`) filtered by. The table's
 * initial state is the default, left out of the URL.
 */
export function tableUrlSpec<TData extends RowData>(
	table: Table<TData>,
	options: UrlStateOptions = {},
): TableUrlSpec {
	const initial = table.initialState;
	return {
		prefix: options.prefix,
		pageSizes: options.pageSizes,
		columns: table.getAllLeafColumns().map((column) => {
			const meta = column.columnDef.meta;
			return {
				id: column.id,
				param: meta?.param,
				sortable: column.getCanSort(),
				filter: meta?.filter ?? (column.columnDef.filterFn === "oneOf" ? "set" : undefined),
				values: meta?.filterValues,
			};
		}),
		defaults: {
			globalFilter: initial.globalFilter ?? "",
			sorting: initial.sorting,
			columnFilters: initial.columnFilters,
			pagination: initial.pagination,
		},
	};
}

/** The parts of the table's state that the URL holds. */
function currentState<TData extends RowData>(table: Table<TData>): TableUrlState {
	return {
		globalFilter: table.atoms.globalFilter.get() ?? "",
		sorting: table.atoms.sorting.get(),
		columnFilters: table.atoms.columnFilters.get(),
		pagination: table.atoms.pagination.get(),
	};
}

/** Puts a state from the URL into the table (the page last, as the others go back to page 1). */
function apply<TData extends RowData>(table: Table<TData>, state: TableUrlState) {
	table.setSorting(state.sorting);
	table.setColumnFilters(state.columnFilters);
	table.setGlobalFilter(state.globalFilter);
	table.setPagination(state.pagination);
}

/** A table's link with the URL, for what works on its URL state, e.g. its saved views. */
export interface TableUrlSync {
	spec: TableUrlSpec;
	/** Which table it is, for its saved views (see `tableViewsKey`). */
	viewsKey: string;
	/** The table's state, as far as the URL holds it. */
	state(): TableUrlState;
	/** Shows a state, e.g. a saved view's: in the table and the URL, as a new history entry. */
	show(state: TableUrlState): void;
}

const syncs = new WeakMap<object, TableUrlSync>();

/** How a table keeps its state in the URL, if it does (see `syncTableWithUrl`). */
export const tableUrlSync = (table: object) => syncs.get(table);

/**
 * Keeps a table's search, filters, sorting and page in the page's URL, both ways: the table starts
 * from the URL (also when rendered on the server), its changes go into the URL, and the URL's
 * changes (back and forward, links) into the table.
 *
 * Changes are navigations to the same page (no `load` or query runs again, and scroll and focus
 * stay): a search replaces the history entry it started (once typing pauses), anything else adds
 * one. Call it while a component initializes; returns a function that makes the next URL change
 * replace the history entry rather than add one.
 */
export function syncTableWithUrl<TData extends RowData>(
	table: Table<TData>,
	options: UrlStateOptions = {},
) {
	const spec = tableUrlSpec(table, options);
	const pathname = page.url.pathname;

	let syncedState = parseTableUrl(page.url.searchParams, spec);
	/** What the URL says (or will say, once navigations under way are done). */
	let synced = tableUrlKey(syncedState, spec);
	if (synced) apply(table, syncedState);

	/** Navigations under way; their URL changes aren't news. */
	let writing = $state(0);
	let replaceNext = false;

	function commit(state: TableUrlState, key: string, replace: boolean) {
		synced = key;
		syncedState = state;
		const url = page.url;
		const params = writeTableUrl(url.searchParams, state, spec);
		writing++;
		goto(`${url.pathname}${searchString(params)}${url.hash}`, { replace, reset: false })
			.catch(() => {})
			.finally(() => writing--);
	}

	syncs.set(table, {
		spec,
		viewsKey: tableViewsKey(page.route.id ?? pathname, options.prefix),
		state: () => currentState(table),
		show(state) {
			const key = tableUrlKey(state, spec);
			if (key !== synced) commit(state, key, false);
			apply(table, state);
		},
	});

	// The table's changes into the URL.
	$effect(() => {
		const state = currentState(table);
		const key = tableUrlKey(state, spec);
		let timer: ReturnType<typeof setTimeout> | undefined;
		untrack(() => {
			if (key === synced) return;
			const replace = replaceNext;
			replaceNext = false;
			const searchOnly =
				tableUrlKey({ ...state, globalFilter: syncedState.globalFilter }, spec) === synced;
			if (!searchOnly) return commit(state, key, replace);
			// Typing: wait for a pause, and keep to one history entry per search.
			const searching = syncedState.globalFilter !== (spec.defaults?.globalFilter ?? "");
			timer = setTimeout(() => commit(state, key, replace || searching), searchDelay);
		});
		// Also when typing goes on (the effect runs again) or the table goes away.
		return () => clearTimeout(timer);
	});

	// The URL's changes (back and forward, links to this page) into the table.
	$effect.pre(() => {
		const url = page.url;
		if (writing || url.pathname !== pathname) return;
		const state = parseTableUrl(url.searchParams, spec);
		const key = tableUrlKey(state, spec);
		untrack(() => {
			if (key === synced) return;
			synced = key;
			syncedState = state;
			apply(table, state);
		});
	});

	return () => {
		replaceNext = true;
	};
}
