/**
 * The client side of a server-side table (see `#lib/server/table-query.ts`): the page reads the
 * table's state from the URL and asks its remote queries for that page of rows and its filters'
 * counts, so the URL (which the table keeps in sync, debouncing the search) decides what's
 * fetched. The table itself (`createAppTable` with `serverSide`) shows the rows as they come.
 */
import type { RowData, SvelteTable } from "@tanstack/svelte-table";
import { onMount } from "svelte";

import type { Features } from "./features.js";
import { parseTableUrl, type SearchParams, tableUrlKey, type TableUrlSpec } from "./url-state.js";

/**
 * The arguments for a server-side table's queries, from the URL: `rows` for the page of rows,
 * `facets` for the counts in its filters, which stays the same while only the page or the
 * sorting changes (so those don't count again). Both are the table's own parameters, in a fixed
 * order without the defaults (e.g. `status=quote&sort=number`), so the same state is the same
 * query, whatever else is in the URL.
 */
export function serverTableQuery(params: SearchParams, spec: TableUrlSpec) {
	const state = parseTableUrl(params, spec);
	const defaults = parseTableUrl(new URLSearchParams(), spec);
	const key = (search: string) => search.replace(/^\?/, "");
	return {
		rows: key(tableUrlKey(state, spec)),
		facets: key(
			tableUrlKey({ ...state, sorting: defaults.sorting, pagination: defaults.pagination }, spec),
		),
	};
}

/**
 * Whether the rows a server-side table shows are for another state than the table's: its search,
 * filters, sorting or page changed, and the rows for them haven't come yet. `key` is the one the
 * rows' query answered with (`TablePlan.key`).
 */
export function isStale<TData extends RowData>(
	table: SvelteTable<Features, TData>,
	spec: TableUrlSpec,
	key: string,
) {
	const state = {
		globalFilter: table.atoms.globalFilter.get() ?? "",
		sorting: table.atoms.sorting.get(),
		columnFilters: table.atoms.columnFilters.get(),
		pagination: table.atoms.pagination.get(),
	};
	return tableUrlKey(state, spec).replace(/^\?/, "") !== key.replace(/^\?/, "");
}

/**
 * Whether a server-side table is waiting for rows (pass to `<table.Table {loading}>`): from when
 * its search, filters, sorting or page change until the rows for them are in, and while a change
 * to the URL (e.g. going back) waits for them, which only then reaches the table. `key` is the one
 * the rows came with. Call it while the component initializes.
 */
export function serverTableLoading<TData extends RowData>(
	table: SvelteTable<Features, TData>,
	spec: TableUrlSpec,
	key: () => string,
) {
	// Hydrating counts as pending work, which the server didn't render.
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	const loading = $derived((hydrated && $effect.pending() > 0) || isStale(table, spec, key()));
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
