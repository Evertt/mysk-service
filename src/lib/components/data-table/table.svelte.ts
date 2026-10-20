import {
	type AccessorFn,
	type AppColumnDefBase,
	createTableHook,
	functionalUpdate,
	makeStateUpdater,
	type OnChangeFn,
	renderComponent,
	type RowData,
} from "@tanstack/svelte-table";
import { type Component, getAllContexts, type Snippet, untrack } from "svelte";

import type { BadgeDisplay } from "#lib/i18n/labels.ts";
import { isOneOf } from "#lib/one-of.ts";

import EnumBadge from "../enum-badge.svelte";
import AfterMount from "./after-mount.svelte";
import ColumnHeader from "./column-header.svelte";
import CurrencyCell from "./currency-cell.svelte";
import DataTable from "./data-table.svelte";
import DateCell from "./date-cell.svelte";
import { type DataTableColumnMeta, type Features, features } from "./features.ts";
import type { PageGroups } from "./grouping.ts";
import type { List } from "./list-definition.ts";
import NumberCell from "./number-cell.svelte";
import { setRowBulkActions } from "./row-bulk-actions.svelte.ts";
import {
	clientWindow,
	resetClientWindow,
	type ScrollWindow,
	setScrollWindow,
} from "./scroll-window.svelte.ts";
import SelectAllHeader from "./select-all-header.svelte";
import SelectCell from "./select-cell.svelte";
import Toolbar from "./toolbar.svelte";
import { syncTableWithUrl, tableUrlSync, type UrlStateOptions } from "./url-sync.svelte.ts";
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
const cellComponents = { SelectCell, DateCell, CurrencyCell, NumberCell };
const headerComponents = { ColumnHeader, SelectAllHeader };

const hook = createTableHook({
	features,
	// Each word of the search in one of the row's columns (see `search-filter.ts`).
	globalFilterFn: "allWords",
	enableRowSelection: true,
	// Sorting a column goes ascending, descending, then unsorted.
	sortDescFirst: false,
	isMultiSortEvent,
	// The rows scroll rather than page (see `scroll-window.svelte.ts`), and `createAppTable` starts
	// them over itself: TanStack's reset would whenever the data is reloaded.
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
	tableComponents: { Table: DataTable, Toolbar, ViewOptions },
	cellComponents,
	headerComponents,
});

export const { useTableContext, useCellContext, useHeaderContext } = hook;

/** A kind's display map, as `withLabels()` makes it: each value's label, icon and tone. */
type EnumDisplay<V extends string> = Readonly<Record<V, BadgeDisplay & { readonly label: string }>>;

/** The keys of `TData` whose values are among `V` (or empty). */
type EnumKey<TData, V extends string> = {
	[K in keyof TData & string]: TData[K] extends V | null ? K : never;
}[keyof TData & string];

/** What `column.enum()` takes: how it shows the values, which ones, and the column's other options. */
export type EnumColumnDef<TData extends RowData, V extends string> = Omit<
	AppColumnDefBase<Features, TData, V | null, typeof cellComponents, typeof headerComponents>,
	"id" | "filterFn" | "sortFn" | "meta"
> &
	(
		| {
				/** Shows each value as its badge (`EnumBadge`), named by its label. */
				display: EnumDisplay<V>;
				label?: never;
		  }
		| {
				/** Shows each value as this text, its label. */
				label: (value: V) => string;
				display?: never;
		  }
	) & {
		/** The column's id; an accessor key's own by default. */
		id?: string;
		/** The values, in order: the filter's, and with `sortByOrder` the sort's. */
		values: readonly V[];
		/** Sorts by the values' order (e.g. by urgency) rather than alphabetically. */
		sortByOrder?: boolean;
		/**
		 * Whether clicking a value filters the table by it (`meta.clickFilter`, which the search also
		 * finds it by); `true` by default. Off for a cell that filters in its own way.
		 */
		clickFilter?: boolean;
		meta: DataTableColumnMeta;
	};

/**
 * A column helper for a table of `TData` rows, with `select()` for the selection column: a
 * checkbox to select the row, and one in the header to select all the rows loaded; and `enum()`
 * for a column of an enum's values.
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
		/**
		 * A column of an enum's values, by an accessor key or function: each shown as its badge
		 * (`display`) or label, filtered by a set of values (`?status=quote,scheduled`), grouped by
		 * value, and clicking a value filters by it. E.g.
		 * `column.enum("priority", { values: orderPriorities, display: orderPriorityDisplay,
		 * sortByOrder: true, meta: { label: m.orders_column_priority } })`. Other options (a `cell`
		 * of its own, `enableGlobalFilter`, `enableGrouping: false`, …) are the column's.
		 */
		enum: <V extends string>(
			accessor: EnumKey<TData, V> | ((row: TData) => V | null),
			{
				id,
				values,
				display,
				label,
				sortByOrder,
				clickFilter = true,
				meta,
				...column
			}: EnumColumnDef<TData, V>,
		) => {
			const named = (value: V) => (display ? display[value].label : label!(value));
			return helper.accessor(
				(typeof accessor === "function"
					? accessor
					: (row: TData) => row[accessor] as V | null) as AccessorFn<TData, V | null>,
				{
					id: id ?? (accessor as string),
					cell: ({ getValue }) => {
						const value = getValue();
						if (value === null || value === undefined) return "";
						return display ? renderComponent(EnumBadge, { display, value }) : named(value);
					},
					filterFn: "oneOf",
					enableGrouping: true,
					...(sortByOrder
						? {
								sortFn: (a, b, columnId) =>
									values.indexOf(a.getValue<V>(columnId)) - values.indexOf(b.getValue<V>(columnId)),
							}
						: {}),
					...column,
					meta: {
						filterValues: values,
						// The filter's, their labels read when shown.
						filterOptions: values.map((value) => ({
							value,
							get label() {
								return named(value);
							},
							...(display?.[value].icon ? { icon: display[value].icon } : {}),
						})),
						...(clickFilter
							? { clickFilter: (value: string) => (isOneOf(values, value) ? named(value) : value) }
							: {}),
						...meta,
					},
				},
			);
		},
	};
}

type HookTableOptions<TData extends RowData> = Parameters<typeof hook.createAppTable<TData>>[0];

export type AppTableOptions<TData extends RowData> = HookTableOptions<TData> & {
	/**
	 * Keeps the search, filters, sorting, grouping and scroll position in the URL (see
	 * `url-state.ts`), with a `prefix` for its parameters if the page has more than one table;
	 * `false` doesn't.
	 */
	urlState?: false | UrlStateOptions;
	/**
	 * The rows are those the server searched, filtered and sorted, a page at a time as the table
	 * scrolls (see `server-table.svelte.ts`): the table only shows them, `rowCount` says how many
	 * match in all, and `scroll` (`scrollPages()`) loads more. The selection is cleared when the
	 * search, filters, sorting or grouping change, as it can only be of rows the table shows. When
	 * grouped, the server sorts by the group first, and `<table.Table groups>` says what it knows
	 * of the groups (see `grouping.ts`).
	 */
	serverSide?: boolean;
	/** A server-side table's rows as it scrolls (`scrollPages()`); a client-side table makes its own. */
	scroll?: ScrollWindow;
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
 * kept in the URL unless `urlState` is `false`. Its rows scroll (see `scroll-window.svelte.ts`):
 * searching, filtering, sorting and grouping start them over from the top.
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
		if (!options.serverSide) resetClientWindow(table);
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

	// The action bar's actions, for the rows' menus too.
	setRowBulkActions();

	// What's inside `<table.AppTable>` waits for the page to mount (see `after-mount.svelte`).
	const AppTable = table.AppTable as Component<{ children: Snippet }>;
	table.AppTable = ((internal: never, props: { children: Snippet }) =>
		AfterMount(internal, { component: AppTable, props })) as unknown as typeof table.AppTable;

	if (options.urlState !== false) syncTableWithUrl(table, options.urlState);

	const scroll =
		options.scroll ??
		(options.serverSide ? undefined : clientWindow(table, tableUrlSync(table)?.position));
	if (scroll) setScrollWindow(table, scroll);

	if (options.serverSide) {
		// Other rows: no selection. More of the same rows (scrolling, a refresh) keep it.
		const keyOf = (): unknown => (scroll ? scroll.key : options.data);
		let rowsKey = keyOf();
		$effect(() => {
			const key = keyOf();
			untrack(() => {
				if (key === rowsKey) return;
				rowsKey = key;
				if (Object.keys(table.atoms.rowSelection.get()).length) table.resetRowSelection(true);
			});
		});
	}

	return table;
}

/** An app table, as `createAppTable` makes it. */
type AppTable<TData extends RowData> = ReturnType<typeof createAppTable<TData>>;

/**
 * A list's table (`createServerTable()`, `createClientTable()`): what `ListLayout` shows. A
 * server-side one also says whether it's waiting for rows, what the server knows of its groups,
 * and which rows match, for its bulk actions.
 */
export interface ListTable<TData extends RowData, C = unknown> {
	table: AppTable<TData>;
	/** Its definition. */
	list: { columns: C; filterKinds: Readonly<Record<string, { range?: string }>> };
	readonly loading?: boolean;
	readonly groups?: PageGroups<TData>;
	/** The rows that match, for "select all matching" (see `BulkActionBar`). */
	readonly matching?: { where: unknown; key: string; count: number };
}

/**
 * The table of a client-side list (`defineList({ mode: "client" })`): all its rows are loaded, and
 * it searches, filters, sorts and groups them in the browser. Its columns are the list's
 * (`withListColumns()`), its rows by id, and its state starts at the list's defaults, kept in the
 * URL. Call it while the component initializes.
 */
export function createClientTable<TData extends RowData & { id: unknown }, C>({
	list,
	data,
	columns,
	initialState,
	getRowId = (row) => String(row.id),
}: {
	list: List<C, "client">;
	/** All the rows. */
	data: () => TData[];
	columns: AppTableOptions<TData>["columns"];
	/** Besides the list's defaults, e.g. the hidden columns. */
	initialState?: AppTableOptions<TData>["initialState"];
	getRowId?: (row: TData) => string;
}): ListTable<TData, C> {
	const table = createAppTable<TData>({
		columns,
		get data() {
			return data();
		},
		getRowId,
		initialState: { ...list.urlSpec.defaults, ...initialState },
	});
	return { table, list };
}
