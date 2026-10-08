import {
	columnFacetingFeature,
	columnFilteringFeature,
	columnGroupingFeature,
	columnPinningFeature,
	columnVisibilityFeature,
	constructFilterFn,
	createFacetedRowModel,
	createFacetedUniqueValues,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	filterFn_includesString,
	globalFilteringFeature,
	metaHelper,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_basic,
	sortFn_datetime,
	sortFn_text,
	tableFeatures,
} from "@tanstack/svelte-table";

import { defaultColumnPinningFeature } from "./default-pinning.ts";
import { sortGroupsFirst } from "./grouping.ts";

export interface DataTableColumnMeta {
	/**
	 * The column's name, for the header and the column visibility menu: a message function, e.g.
	 * `m.orders_column_number`, so it's translated when shown. (A plain string isn't translated.)
	 */
	label?: string | (() => string);
	/** Right-align numeric columns. */
	align?: "start" | "end";
	/**
	 * The column's name in the URL (its filter's parameter, and in `?sort=`), if not its id: short,
	 * lower case, e.g. `scheduled` for `scheduledFor`. See `url-state.ts`.
	 */
	param?: string;
	/** Puts the column's filter in the URL as a set of values; implied by `filterFn: "oneOf"`. */
	filter?: "set";
	/** The values the column's filter can have; others in the URL are ignored. */
	filterValues?: readonly string[];
	/**
	 * When the rows are grouped by another column, each group's header shows the sum of this
	 * column over the group's rows, formatted with this (e.g. `formatCents`). Only where the table
	 * has all the rows (not server-side tables, whose groups go on beyond the page).
	 */
	groupSum?: (sum: number) => string;
	/**
	 * A group's name when the rows are grouped by this column, from its grouping value, if its cell
	 * (of the group's first row, which the group's header shows otherwise) wouldn't do.
	 */
	groupLabel?: (value: unknown) => string;
}

/** A column's name as shown: its translated `meta.label`, or its id. */
export function columnLabel(column: { id: string; columnDef: { meta?: DataTableColumnMeta } }) {
	const label = column.columnDef.meta?.label;
	return (typeof label === "function" ? label() : label) ?? column.id;
}

/** Keeps rows whose value is one of the selected values (used by the faceted filters). */
const filterFn_oneOf = constructFilterFn({
	filter: (dataValue: unknown, filterValue: unknown[]) => filterValue.includes(dataValue),
	autoRemove: (value: unknown[] | undefined) => !value?.length,
});

/**
 * The table features every data table in the app opts into. TanStack Table v9 is tree-shaken:
 * only registered features, row models and sort/filter functions end up in the bundle.
 */
const tableFeatureSet = tableFeatures({
	rowSortingFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	columnFilteringFeature,
	columnFacetingFeature,
	columnVisibilityFeature,
	globalFilteringFeature,
	columnPinningFeature,
	// Only the grouping's state and column APIs: `sortGroupsFirst` keeps a group's rows together.
	columnGroupingFeature,
	columnMeta: metaHelper<DataTableColumnMeta>(),
	sortedRowModel: sortGroupsFirst(createSortedRowModel()),
	filteredRowModel: createFilteredRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
	facetedRowModel: createFacetedRowModel(),
	facetedUniqueValues: createFacetedUniqueValues(),
	filterFns: {
		includesString: filterFn_includesString,
		oneOf: filterFn_oneOf,
	},
	sortFns: {
		alphanumeric: sortFn_alphanumeric,
		basic: sortFn_basic,
		datetime: sortFn_datetime,
		text: sortFn_text,
	},
});

/**
 * Plus `defaultColumnPinningFeature`, which pins each table's identifying and actions columns.
 * `tableFeatures()` only types TanStack's own features (a custom one would be declared on
 * table-core's `Plugins`, which isn't a dependency we can augment), and this one adds no state
 * or APIs, so it's added at runtime only, after `columnPinningFeature`.
 */
export const features = {
	...tableFeatureSet,
	defaultColumnPinningFeature,
} as typeof tableFeatureSet;

export type Features = typeof features;
