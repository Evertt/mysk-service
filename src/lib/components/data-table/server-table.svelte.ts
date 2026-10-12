import { navigating, page } from "$app/state";
/**
 * The client side of a server-side table (see `#lib/server/lists/plan.ts`): the page reads the
 * table's state from the URL into the list's query (`toListQuery()` in `list-definition.ts`) and
 * asks its remote queries for that page of rows (the query) and its filters' counts (its
 * `whereOf()`), so the URL (which the table keeps in sync, debouncing the search) decides what's
 * fetched. The table itself (`createAppTable` with `serverSide`) shows the rows as they come, and
 * `isStale()` and `serverTableLoading()` tell whether they are the table's.
 */
import type { RowData, SvelteTable } from "@tanstack/svelte-table";

import type { Features } from "./features.ts";
import { type List, queryKey, toListQuery } from "./list-definition.ts";
import { parseTableUrl, type TableUrlSpec } from "./url-state.ts";

/**
 * What a URL spec makes of URLs: its sortable, groupable and filtered columns, with their names
 * in the URL, and its defaults. A server-side table's spec (from its columns, see `tableUrlSpec`)
 * and its list's (`urlSpec`, from the definition) must agree on it, which its `columns.spec.ts`
 * checks.
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
		pageSizes: spec.pageSizes,
	};
}

/**
 * Whether the rows a server-side table shows are for another state than the table's: its search,
 * filters, sorting or page changed, and the rows for them haven't come yet. `key` is the one the
 * rows' query answered with (`queryKey(input)`).
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
		pagination: table.atoms.pagination.get(),
		grouping: table.atoms.grouping.get(),
	};
	return queryKey(toListQuery(list, state)) !== key;
}

/**
 * Whether a server-side table is waiting for rows (pass to `<table.Table {loading}>`): from when
 * its search, filters, sorting or page change until the rows for them are in, and while a change
 * to the URL (e.g. going back) waits for them, which only then reaches the table. `key` is the one
 * the rows came with. Call it while the component initializes.
 *
 * It compares the rows' key with what the table and a navigation under way ask for, rather than
 * counting pending work with `$effect.pending()`: Svelte (5.57) keeps whatever reads that alive
 * after it's gone, and with it the table, and in development navigating from such a page to the
 * dashboard's charts hangs the tab.
 */
export function serverTableLoading<TData extends RowData>(
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
	/** Shown after the label, e.g. the code. */
	detail?: string;
}

/** What a `RecordFilter` loads: the options matching its search, and the ticked ones. */
export interface RecordOptions {
	/** Those that match the search, the first so many. */
	options: RecordOption[];
	/** The ticked ones, by name (those that exist). */
	selected: RecordOption[];
	/** Whether more match than `options` has. */
	more: boolean;
}
