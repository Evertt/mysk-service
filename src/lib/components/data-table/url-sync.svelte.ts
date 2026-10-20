import { goto } from "$app/navigation";
import { navigating, page } from "$app/state";
import type { RowData, SvelteTable } from "@tanstack/svelte-table";
import { untrack } from "svelte";

import {
	type ColumnVisibility,
	currentVisibility,
	defaultVisibility,
	showColumns,
} from "./column-visibility.ts";
import { type Features, filterFnGrammar } from "./features.ts";
import { passedMemory, passedOwner, rememberTable } from "./table-memory.svelte.ts";
import {
	parseTablePosition,
	parseTableUrl,
	searchString,
	tableUrlKey,
	type TableUrlSpec,
	type TableUrlState,
	writeTablePosition,
	writeTableUrl,
} from "./url-state.ts";
import { type TableColumns, tableViewsKey, viewQuery } from "./views.ts";

/** How a table keeps its state in the URL (see `url-state.ts` for the grammar). */
export interface UrlStateOptions {
	/** Put before the table's parameters, for a page with more than one table: `orders.sort`. */
	prefix?: string;
}

type Table<TData extends RowData> = SvelteTable<Features, TData>;

/** How long typing in the search box waits before the URL follows. */
const searchDelay = 300;

/**
 * The URL spec of a table, from its columns: their `meta.param` names them, sortable columns can
 * be sorted by, groupable ones (`enableGrouping`) grouped by, and those with a `oneOf` filter, a
 * range filter (`inDateRange`, `inNumberRange`) or `meta.filter` filtered by. The table's initial state is the default, left out of the URL.
 */
export function tableUrlSpec<TData extends RowData>(
	table: Table<TData>,
	options: UrlStateOptions = {},
): TableUrlSpec {
	const initial = table.initialState;
	return {
		prefix: options.prefix,
		columns: table.getAllLeafColumns().map((column) => {
			const meta = column.columnDef.meta;
			const filter =
				meta?.filter ??
				(typeof column.columnDef.filterFn === "string"
					? filterFnGrammar[column.columnDef.filterFn]
					: undefined);
			return {
				id: column.id,
				param: meta?.param,
				sortable: column.getCanSort(),
				groupable: column.getCanGroup(),
				filter,
				values: meta?.filterValues,
				// A set filter's `none` is among its values (or any value).
				none: filter && filter !== "set" ? meta?.filterNone : undefined,
			};
		}),
		defaults: {
			globalFilter: initial.globalFilter ?? "",
			sorting: initial.sorting,
			columnFilters: initial.columnFilters,
			grouping: initial.grouping ?? [],
		},
	};
}

/** The parts of the table's state that the URL holds. */
function currentState<TData extends RowData>(table: Table<TData>): TableUrlState {
	return {
		globalFilter: table.atoms.globalFilter.get() ?? "",
		sorting: table.atoms.sorting.get(),
		columnFilters: table.atoms.columnFilters.get(),
		grouping: table.atoms.grouping.get(),
	};
}

/** Puts a state from the URL into the table. */
function apply<TData extends RowData>(table: Table<TData>, state: TableUrlState) {
	table.setSorting(state.sorting);
	table.setColumnFilters(state.columnFilters);
	table.setGlobalFilter(state.globalFilter);
	table.setGrouping(state.grouping);
}

/**
 * A table's link with the URL, for what works on its URL state and columns: its saved views
 * (`saved-views.svelte`) and its memory (`table-memory.svelte.ts`).
 */
export interface TableUrlSync {
	spec: TableUrlSpec;
	/** Which table it is, for its saved views and memory (see `tableViewsKey`). */
	viewsKey: string;
	/**
	 * Whose table it is (the organization and the member), if its page brings back its memory
	 * (see `table-memory.svelte.ts`): what the browser keeps of it is kept per owner.
	 */
	owner: string | undefined;
	/** The table's state, as far as the URL holds it. */
	state(): TableUrlState;
	/** What a view would save of the state (see `viewQuery`). */
	viewQuery(): string;
	/** Its hideable columns' visibility, now and by default. */
	columns(): TableColumns;
	/**
	 * Shows a state, e.g. a saved view's: in the table and the URL, as a new history entry, with
	 * the columns given (the defaults for those it doesn't have), if any.
	 */
	show(state: TableUrlState, columns?: ColumnVisibility | null): void;
	/**
	 * The saved view last opened or saved (whose changes the table may show), until another is
	 * chosen, or none: kept with the table's memory.
	 */
	viewId: number | undefined;
	/**
	 * Where the URL said the rows were scrolled to when the table opened (`?row=`, the index of the
	 * first row in view; see `parseTablePosition`).
	 */
	position: number;
	/**
	 * Keeps where the rows are scrolled to in the URL (see `scroll-position.svelte.ts`), in the
	 * history entry the table is on, without a navigation: a link or a reload opens the table
	 * there, and so does coming back to it.
	 */
	keepPosition(position: number): void;
}

const syncs = new WeakMap<object, TableUrlSync>();

/** How a table keeps its state in the URL, if it does (see `syncTableWithUrl`). */
export const tableUrlSync = (table: object) => syncs.get(table);

/**
 * Keeps a table's search, filters, sorting and grouping in the page's URL, both ways: the table starts
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

	const viewsKey = tableViewsKey(page.route.id ?? pathname, options.prefix);
	let viewId = $state<number>();
	const sync: TableUrlSync = {
		spec,
		viewsKey,
		owner: passedOwner(),
		state: () => currentState(table),
		viewQuery: () => viewQuery(currentState(table), spec),
		columns: () => ({ current: currentVisibility(table), defaults: defaultVisibility(table) }),
		show(state, columns) {
			const key = tableUrlKey(state, spec);
			if (key !== synced) commit(state, key, false);
			apply(table, state);
			if (columns !== undefined) showColumns(table, columns);
		},
		get viewId() {
			return viewId;
		},
		set viewId(id) {
			viewId = id;
		},
		position: parseTablePosition(page.url.searchParams, spec),
		keepPosition(position) {
			// Not while the table's own navigations are under way: their URLs are for other rows.
			if (writing) return;
			const url = new URL(location.href);
			if (url.pathname !== pathname) return;
			const search = searchString(writeTablePosition(url.searchParams, position, spec));
			if (search === searchString(url.searchParams)) return;
			// Not SvelteKit's `goto` (even a shallow one, which is a navigation: it would cancel one the
			// reader started meanwhile, and show the progress bar). Its own history entry stays as it
			// is (`history.state`), so going back and forward works as before, and `page.url` doesn't
			// change: it's where the rows are, not what they are.
			history.replaceState(history.state, "", `${url.pathname}${search}${url.hash}`);
		},
	};
	syncs.set(table, sync);

	// The table as the member left it, if its page brings it back (see `table-memory.svelte.ts`):
	// its columns, and the view if it shows what the view was left at.
	const memory = passedMemory(viewsKey);
	if (memory !== undefined && sync.owner !== undefined) {
		showColumns(table, memory?.columns);
		if (memory?.viewId != null && memory.query === sync.viewQuery()) viewId = memory.viewId;
		rememberTable(table, sync, memory, sync.owner);
	}

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
			timer = setTimeout(() => {
				// Not once a navigation elsewhere is under way (a link clicked before typing paused):
				// writing the search then would cancel it, and the member would stay on this page.
				if (navigating.to && navigating.to.url.pathname !== pathname) return;
				commit(state, key, replace || searching);
			}, searchDelay);
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
