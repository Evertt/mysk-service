/**
 * The rows a data table shows, as it scrolls: a window onto all the rows that match, which grows
 * as the reader nears its end (and, for a server-side table opened partway down, its start)
 * instead of turning pages. `data-table.svelte` asks for more when its last (or first) row comes
 * near the screen, says when more are loading and when the list ends, and keeps the position in
 * the URL (`?row=`, see `scroll-position.svelte.ts`).
 *
 * - A **client-side table** has all its rows: its window (`clientWindow`, made by
 *   `createAppTable`) renders the first so many, through TanStack's pagination (page 0, the size
 *   growing by `windowStep`), so a long table doesn't render every row at once.
 * - A **server-side table**'s window loads pages of rows from its remote query as it goes
 *   (`scrollPages()` in `server-table.svelte.ts`).
 *
 * Either starts over from the top when the search, filters, sorting or grouping change.
 */
import type { RowData, SvelteTable } from "@tanstack/svelte-table";

import type { Features } from "./features.ts";

/** What a table shows of its rows (see above). */
export interface ScrollWindow {
	/**
	 * What the rows are for: changes when they're for another search, filter, sorting or grouping
	 * (when the table goes back to the top).
	 */
	readonly key: string;
	/** The index of the first row shown among all those that match (0 unless opened further down). */
	readonly start: number;
	/** How many rows it adds at a time. */
	readonly step: number;
	/** Whether there are rows after those shown. */
	readonly more: boolean;
	/** Whether there are rows before those shown. */
	readonly earlier: boolean;
	/** Whether rows after those shown are on their way. */
	readonly loadingMore: boolean;
	/** Whether rows before those shown are on their way. */
	readonly loadingEarlier: boolean;
	/** Shows the next rows (if there are more, and none on their way). */
	loadMore(): void;
	/** Shows the rows before (if there are earlier ones, and none on their way). */
	loadEarlier(): void;
}

const windows = new WeakMap<object, ScrollWindow>();

/** A table's window onto its rows (see above). */
export const scrollWindow = (table: object) => windows.get(table);

/** Sets a table's window onto its rows. */
export const setScrollWindow = (table: object, window: ScrollWindow) => {
	windows.set(table, window);
};

/** How many rows a client-side table renders at first, and adds as it scrolls. */
const windowStep = 50;

/**
 * The window of a client-side table: its first rows (TanStack's first page, as large as what's
 * been scrolled through), starting with enough of them to show the row at `position`.
 */
export function clientWindow<TData extends RowData>(
	table: SvelteTable<Features, TData>,
	position = 0,
): ScrollWindow {
	const size = () => table.atoms.pagination.get().pageSize;
	// Up to the row's step, and the next, so there's something to scroll to below it.
	const steps = position > 0 ? Math.floor(position / windowStep) + 2 : 1;
	table.setPagination({ pageIndex: 0, pageSize: steps * windowStep });
	const key = $derived(
		JSON.stringify([
			table.atoms.globalFilter.get() ?? "",
			table.atoms.sorting.get(),
			table.atoms.columnFilters.get(),
			table.atoms.grouping.get(),
		]),
	);
	return {
		get key() {
			return key;
		},
		start: 0,
		step: windowStep,
		get more() {
			return table.getPrePaginatedRowModel().rows.length > size();
		},
		earlier: false,
		loadingMore: false,
		loadingEarlier: false,
		loadMore() {
			if (table.getPrePaginatedRowModel().rows.length > size()) {
				table.setPageSize(size() + windowStep);
			}
		},
		loadEarlier() {},
	};
}

/** Back to the first rows (after the search, filters, sorting or grouping changed). */
export function resetClientWindow<TData extends RowData>(table: SvelteTable<Features, TData>) {
	const { pageIndex, pageSize } = table.atoms.pagination.get();
	if (pageIndex !== 0 || pageSize !== windowStep) {
		table.setPagination({ pageIndex: 0, pageSize: windowStep });
	}
}
