import { getContext, onDestroy, setContext, type Snippet } from "svelte";

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

const key = Symbol("table-filters");

/** Makes the registry the toolbar's children register their filters with. */
export function provideTableFilters() {
	const filters = new TableFilters();
	setContext(key, filters);
	return filters;
}

/** Registers a filter with the toolbar for as long as the component calling this lives. */
export function registerTableFilter(filter: TableFilter) {
	const filters = getContext<TableFilters | undefined>(key);
	if (!filters) throw new Error("A table filter needs to be inside the table's Toolbar");
	onDestroy(filters.register(filter));
}
