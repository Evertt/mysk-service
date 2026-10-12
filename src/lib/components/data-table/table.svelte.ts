import {
	createTableHook,
	functionalUpdate,
	makeStateUpdater,
	type OnChangeFn,
	renderComponent,
	type RowData,
} from "@tanstack/svelte-table";
import { getAllContexts, untrack } from "svelte";

import ColumnHeader from "./column-header.svelte";
import CurrencyCell from "./currency-cell.svelte";
import DataTable from "./data-table.svelte";
import DateCell from "./date-cell.svelte";
import { features } from "./features.ts";
import NumberCell from "./number-cell.svelte";
import Pagination from "./pagination.svelte";
import SelectAllHeader from "./select-all-header.svelte";
import SelectCell from "./select-cell.svelte";
import Toolbar from "./toolbar.svelte";
import { syncTableWithUrl, type UrlStateOptions } from "./url-sync.svelte.ts";
import ViewOptions from "./view-options.svelte";

/** Shift-, Cmd- or Ctrl-clicking a column header adds it to the sort (see `ColumnHeader`). */
export function isMultiSortEvent(event: unknown) {
	return (
		(event instanceof MouseEvent || event instanceof KeyboardEvent) &&
		(event.shiftKey || event.metaKey || event.ctrlKey)
	);
}

/**
 * App-wide table hook: tables created with `createAppTable` share the features, defaults and
 * the shadcn-svelte building blocks below. Those components take no props for the table, cell
 * or header; they read it from context with `useTableContext`, `useCellContext` and
 * `useHeaderContext`.
 */
const hook = createTableHook({
	features,
	globalFilterFn: "includesString",
	enableRowSelection: true,
	// Sorting a column goes ascending, descending, then unsorted.
	sortDescFirst: false,
	isMultiSortEvent,
	// `createAppTable` goes back to the first page itself: TanStack's reset would also undo a page
	// restored from the URL, and jump to the first page whenever the data is reloaded.
	autoResetPageIndex: false,
	defaultColumn: {
		// Days and moments by their own order, anything else as TanStack picks (see `features.ts`).
		sortFn: "byValue",
		// Columns opt into grouping (see `grouping.ts`), which leaves the columns where they are.
		enableGrouping: false,
		// A data column's header sorts it (see `ColumnHeader`); a display column, e.g. the actions,
		// has none unless it brings its own, like the selection column's.
		header: ({ header }) => (header.column.accessorFn ? renderComponent(ColumnHeader) : ""),
	},
	groupedColumnMode: false,
	tableComponents: { Table: DataTable, Toolbar, Pagination, ViewOptions },
	cellComponents: { SelectCell, DateCell, CurrencyCell, NumberCell },
	headerComponents: { ColumnHeader, SelectAllHeader },
});

export const { useTableContext, useCellContext, useHeaderContext } = hook;

/**
 * A column helper for a table of `TData` rows, with `select()` for the selection column: a
 * checkbox to select the row, and one in the header to select all the rows of the page.
 */
export function createAppColumnHelper<TData extends RowData>() {
	const helper = hook.createAppColumnHelper<TData>();
	return {
		...helper,
		select: () =>
			helper.display({
				id: "select",
				header: ({ header }) => renderComponent(header.SelectAllHeader),
				cell: ({ cell }) => renderComponent(cell.SelectCell),
				enableSorting: false,
				enableHiding: false,
			}),
	};
}

type HookTableOptions<TData extends RowData> = Parameters<typeof hook.createAppTable<TData>>[0];

export type AppTableOptions<TData extends RowData> = HookTableOptions<TData> & {
	/**
	 * Keeps the search, filters, sorting and page in the URL (see `url-state.ts`), with a
	 * `prefix` for its parameters if the page has more than one table; `false` doesn't.
	 */
	urlState?: false | UrlStateOptions;
	/**
	 * The rows are one page that the server searched, filtered, sorted and paged (see
	 * `server-table.svelte.ts`): the table only shows them, and `rowCount` says how many match in
	 * all. The selection is cleared when the rows change, as it can only be of rows the table shows.
	 * When grouped, the server sorts by the group first, and `<table.Table groups>` says what it
	 * knows of the page's groups (see `grouping.ts`).
	 */
	serverSide?: boolean;
};

/** Whether a component is initializing (a table made outside one, e.g. in a test, isn't synced). */
function inComponent() {
	try {
		getAllContexts();
		return true;
	} catch {
		return false;
	}
}

/**
 * Creates a table with the app's features and components (see the hook above), whose state is
 * kept in the URL unless `urlState` is `false`. Searching, filtering and sorting go back to the
 * first page; a page beyond the last (e.g. after rows were deleted) becomes the last.
 */
export function createAppTable<TData extends RowData>(options: AppTableOptions<TData>) {
	// A copy with its getters (e.g. a reactive `data`) intact.
	const tableOptions = Object.defineProperties(
		{},
		Object.getOwnPropertyDescriptors(options),
	) as AppTableOptions<TData>;

	// oxlint-disable-next-line prefer-const -- assigned once the handlers below exist
	let table: ReturnType<typeof hook.createAppTable<TData>>;
	const firstPage = () => {
		if (table.atoms.pagination.get().pageIndex !== 0) table.setPageIndex(0);
	};
	const handlers = {
		sorting: "onSortingChange",
		columnFilters: "onColumnFiltersChange",
		globalFilter: "onGlobalFilterChange",
		grouping: "onGroupingChange",
	} as const;
	for (const [slice, handler] of Object.entries(handlers) as [keyof typeof handlers, string][]) {
		const settable = tableOptions as unknown as Record<string, OnChangeFn<unknown> | undefined>;
		const own = settable[handler];
		settable[handler] = (updater) => {
			const before: unknown = table.atoms[slice].get();
			const next = functionalUpdate(updater, before);
			(own ?? makeStateUpdater(slice, table))(next);
			if (next !== before) firstPage();
		};
	}

	if (options.serverSide) {
		Object.assign(tableOptions, {
			manualPagination: true,
			manualSorting: true,
			manualFiltering: true,
		});
	}

	table = hook.createAppTable(tableOptions);
	if (!inComponent()) return table;

	if (options.serverSide) {
		$effect(() => {
			void options.data;
			untrack(() => {
				if (Object.keys(table.atoms.rowSelection.get()).length) table.resetRowSelection(true);
			});
		});
	}

	const replaceNext =
		options.urlState === false ? undefined : syncTableWithUrl(table, options.urlState);
	$effect(() => {
		const { pageIndex } = table.atoms.pagination.get();
		const pages = table.getPageCount();
		if (pageIndex > 0 && pages >= 0 && pageIndex >= Math.max(pages, 1)) {
			untrack(() => {
				replaceNext?.();
				table.setPageIndex(Math.max(pages - 1, 0));
			});
		}
	});
	return table;
}
