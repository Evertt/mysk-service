import type { RowData, SvelteTable } from "@tanstack/svelte-table";
import { createContext, onDestroy, type Snippet } from "svelte";

import { columnLabel, columnNone, type Features, noneLabel } from "./features.ts";

/**
 * A filter of a table's toolbar, as `FacetedFilter`, `RecordFilter`, `DateRangeFilter` and
 * `NumberRangeFilter` register it: the toolbar
 * lists it in its Filter menu and, while it has values, shows it as a pill (see `Toolbar`).
 */
export interface TableFilter {
	/** The column it filters. */
	readonly columnId: string;
	/** The column's label, e.g. "Status". */
	readonly title: string;
	/**
	 * The labels of the chosen values, in the filter's order (a range's: one, e.g. "This week");
	 * none while the filter is off.
	 */
	readonly chosen: readonly string[];
	/**
	 * The values to choose from, with a search box (or a range's presets and ends): shown in the
	 * Filter menu and the pill.
	 */
	content: Snippet;
	/** Takes the filter off. */
	clear(): void;
}

/** The filters a toolbar's children registered, in their order. */
export class TableFilters {
	all = $state.raw<TableFilter[]>([]);
	/** The ones with values chosen, shown as pills. */
	active = $derived(this.all.filter((filter) => filter.chosen.length > 0));

	/** Adds a filter; the function returned takes it away again. */
	register(filter: TableFilter) {
		this.all = [...this.all, filter];
		return () => {
			this.all = this.all.filter((other) => other !== filter);
		};
	}
}

const [getFilters, setFilters] = createContext<TableFilters>();

/** Makes the registry the toolbar's children register their filters with. */
export const provideTableFilters = () => setFilters(new TableFilters());

/** Registers a filter with the toolbar (it's inside) for as long as the component calling this lives. */
export function registerTableFilter(filter: TableFilter) {
	onDestroy(getFilters().register(filter));
}

/** What a filter component is given of its column: which it is, and what to call it. */
interface FilterProps {
	columnId: string;
	title?: string;
	/** `true` to offer `none` (named as the column's, `noneLabel()`), `false` not to. */
	none?: string | boolean;
}

/**
 * A filter component's column, and its title and `none` label: those given (`props`, its props,
 * read as they change), else the column's: its label, and its `meta.none` if it takes `none` (`columnNone()`).
 * Call it while the component initializes.
 */
export function filterColumn<TData extends RowData>(
	table: SvelteTable<Features, TData>,
	props: () => FilterProps,
) {
	const given = $derived(props());
	const column = $derived(table.getColumn(given.columnId));
	const title = $derived(given.title ?? (column ? columnLabel(column) : given.columnId));
	const none = $derived(
		given.none === undefined
			? columnNone(column)
			: given.none === true
				? noneLabel(column)
				: given.none || undefined,
	);
	return {
		get column() {
			return column;
		},
		get title() {
			return title;
		},
		/** The label of the option for the rows without a value, if there is one. */
		get none() {
			return none;
		},
	};
}
