/**
 * Clicking a value in a table's cell to filter by it (see `filter-value.svelte`, and the status
 * cells' badges, `badge-select.svelte`'s `filter`).
 *
 * A value that the column's set filter knows (a status, a type, a country) goes in that filter,
 * through the table's own filter state, so it lands in the URL and a server-side table fetches its
 * rows, as if it had been ticked in the toolbar's filter. A plain text value without a filter of
 * its own (a city) goes in the search box instead. Relations that link to another record's page
 * (an order's customer) keep their link and don't filter.
 *
 * The click toggles: a value that isn't filtered by yet is added to the column's filter (the rows
 * shown all match the filter, so in practice only while the column isn't filtered yet), and one
 * that is filtered by is taken out of it, which is the way back from a click: the same as ticking
 * the value in the toolbar's filter. The search box takes the value in place of what's in it, and
 * a value that's already the whole search clears it.
 */
import { m } from "#lib/paraglide/messages.js";

import { useCellContext, useTableContext } from "./table.svelte.ts";

/** What clicking a value in a cell filters by. */
export interface ValueFilter {
	/** The value: as the column's set filter has it (a code, an enum value), or the text to search. */
	value: string;
	/** The value as shown, e.g. "Quote", for "Filter by Quote". */
	label: string;
	/** The column whose filter takes the value, if not the cell's own. */
	columnId?: string;
	/** Puts the value in the search box instead of a filter. */
	search?: boolean;
}

/** A set filter's values with `value` added, or taken out if it's there; `undefined` for none. */
export function toggleValue(values: readonly string[] | undefined, value: string) {
	const next = values?.includes(value)
		? values.filter((other) => other !== value)
		: [...(values ?? []), value];
	return next.length ? next : undefined;
}

/** The search with `value` in it, or none if `value` is the search already. */
export function toggleSearch(search: string, value: string) {
	return search.trim() === value ? "" : value;
}

/**
 * Filtering by a cell's value: whether it's filtered by now, its button's label ("Filter by
 * Quote", or "Stop filtering by Quote" when it is), and `toggle()`, which filters by it or stops.
 * Call it while a cell's component initializes (it reads the table and the cell from context);
 * `filter` is read when used, so it follows the row the cell shows.
 */
export function cellFilter(filter: () => ValueFilter) {
	const table = useTableContext();
	// A cell's component has its cell; the filter may name another column all the same.
	let own: string | undefined;
	try {
		own = useCellContext().column.id;
	} catch {
		own = undefined;
	}

	const column = () => {
		const id = filter().columnId ?? own;
		return id === undefined ? undefined : table.getColumn(id);
	};

	const active = $derived.by(() => {
		const { value, search } = filter();
		if (search) return (table.atoms.globalFilter.get() ?? "").trim() === value;
		const values = column()?.getFilterValue() as string[] | undefined;
		return values?.includes(value) ?? false;
	});

	return {
		get active() {
			return active;
		},
		get label() {
			const { label, search } = filter();
			if (search) {
				return active ? m.common_table_search_clear() : m.common_table_search_for({ value: label });
			}
			return active
				? m.common_table_filter_by_stop({ value: label })
				: m.common_table_filter_by({ value: label });
		},
		toggle() {
			const { value, search } = filter();
			if (search) {
				table.setGlobalFilter(toggleSearch(table.atoms.globalFilter.get() ?? "", value));
				return;
			}
			const target = column();
			target?.setFilterValue(toggleValue(target.getFilterValue() as string[] | undefined, value));
		},
	};
}
