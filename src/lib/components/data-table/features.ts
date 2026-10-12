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
import {
	dateInRange,
	numberInRange,
	parseDateRange,
	parseNumberRange,
	type RangeGrammar,
} from "./ranges.ts";
import { noneToken } from "./url-state.ts";

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
	/**
	 * Puts the column's filter in the URL as a set of values (implied by `filterFn: "oneOf"`) or a
	 * range (`dateRange`, `numberRange`: implied by `filterFn: "inDateRange"` and
	 * `"inNumberRange"`, see `ranges.ts`).
	 */
	filter?: "set" | RangeGrammar;
	/**
	 * The values the column's filter can have; others in the URL are ignored. For a column that can
	 * be empty, `noneToken` among them (the filter's `none` option, `?status=none`).
	 */
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

/**
 * Keeps rows whose value is one of the selected values (used by the faceted filters); rows without
 * a value (`null` or `undefined`) are kept by `none` (`noneToken`, the filter's `none` option).
 */
const filterFn_oneOf = constructFilterFn({
	filter: (dataValue: unknown, filterValue: unknown[]) =>
		filterValue.includes(dataValue ?? noneToken),
	autoRemove: (value: unknown[] | undefined) => !value?.length,
});

/**
 * Keeps rows whose date is in the range of the filter's value, its token from the URL (e.g.
 * `this-week` or `2026-10-01..2026-10-07`, see `ranges.ts`), read on the day it filters. Rows
 * without a date are left out. Used by `DateRangeFilter`.
 */
const filterFn_inDateRange = constructFilterFn({
	filter: (dataValue: unknown, filterValue: string[]) => {
		const range = parseDateRange(filterValue[0] ?? "");
		return !range || dateInRange(dataValue, range);
	},
	autoRemove: (value: string[] | undefined) => !value?.length,
});

/**
 * Keeps rows whose number is in the range of the filter's value (e.g. `..10`), like
 * `inDateRange`. Used by `NumberRangeFilter`.
 */
const filterFn_inNumberRange = constructFilterFn({
	filter: (dataValue: unknown, filterValue: string[]) => {
		const range = parseNumberRange(filterValue[0] ?? "");
		return !range || numberInRange(dataValue, range);
	},
	autoRemove: (value: string[] | undefined) => !value?.length,
});

/** The URL grammar a column's filter function implies (see `DataTableColumnMeta.filter`). */
export const filterFnGrammar: Readonly<Record<string, "set" | RangeGrammar>> = {
	oneOf: "set",
	inDateRange: "dateRange",
	inNumberRange: "numberRange",
};

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
		inDateRange: filterFn_inDateRange,
		inNumberRange: filterFn_inNumberRange,
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
