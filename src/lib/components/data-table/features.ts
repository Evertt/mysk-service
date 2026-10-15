import {
	columnFacetingFeature,
	columnFilteringFeature,
	columnGroupingFeature,
	columnPinningFeature,
	columnVisibilityFeature,
	constructFilterFn,
	constructSortFn,
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
import { inAnyRange, type RangeGrammar } from "./ranges.ts";
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
	 * range (`dateRange`, `numberRange`, `moneyRange`: implied by `filterFn: "inDateRange"`,
	 * `"inNumberRange"` and `"inMoneyRange"`, see `ranges.ts`).
	 */
	filter?: "set" | RangeGrammar;
	/**
	 * For a range filter on a column that can be empty: takes `none` (`?scheduled=none,this-week`),
	 * the rows without a value. Give the filter's component its `none` label too.
	 */
	filterNone?: boolean;
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
	/**
	 * Clicking a cell's value toggles it in the column's set filter (see `cell-filter.svelte.ts`);
	 * this names the value as shown, for "Filter by …", e.g. `(type) => types[type].label`. For a
	 * column of plain values with a set filter of their own: a column that links to another
	 * record's page keeps its link instead. A cell without a value (`null`) isn't clickable.
	 */
	clickFilter?: (value: string) => string;
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
 * A range filter's function: keeps the rows whose value is in any of the filter's values, its
 * tokens from the URL (e.g. `none,this-week` or `..10`, see `ranges.ts`), read on the day it
 * filters. Used by `DateRangeFilter` and `NumberRangeFilter`.
 */
const rangeFilterFn = (grammar: RangeGrammar) =>
	constructFilterFn({
		filter: (dataValue: unknown, filterValue: string[]) =>
			inAnyRange(grammar, dataValue, filterValue),
		autoRemove: (value: string[] | undefined) => !value?.length,
	});

/**
 * Every column's sort unless it brings its own (`defaultColumn` in `table.svelte.ts`): days and
 * moments (`Temporal.PlainDate`, `Temporal.Instant`) by their own `compare`, as they have no
 * `valueOf` for TanStack's `basic` (which it falls back to for anything but text and `Date`s) to
 * compare with; anything else as TanStack's `auto` would.
 */
const sortFn_byValue = constructSortFn({
	sort: (a: unknown, b: unknown, rowA, rowB, columnId) => {
		if (a instanceof Temporal.PlainDate && b instanceof Temporal.PlainDate) {
			return Temporal.PlainDate.compare(a, b);
		}
		if (a instanceof Temporal.Instant && b instanceof Temporal.Instant) {
			return Temporal.Instant.compare(a, b);
		}
		const { table } = rowA as unknown as {
			table: { getColumn(id: string): AutoSorted | undefined };
		};
		const auto = table.getColumn(columnId)?.getAutoSortFn() ?? sortFn_basic;
		return auto(rowA, rowB, columnId);
	},
});

/** What `sortFn_byValue` needs of a column (TanStack's). */
interface AutoSorted {
	getAutoSortFn(): typeof sortFn_basic;
}

/** The URL grammar a column's filter function implies (see `DataTableColumnMeta.filter`). */
export const filterFnGrammar: Readonly<Record<string, "set" | RangeGrammar>> = {
	oneOf: "set",
	inDateRange: "dateRange",
	inNumberRange: "numberRange",
	inMoneyRange: "moneyRange",
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
		inDateRange: rangeFilterFn("dateRange"),
		inNumberRange: rangeFilterFn("numberRange"),
		// Money in cents, the URL's in euros.
		inMoneyRange: rangeFilterFn("moneyRange"),
	},
	sortFns: {
		alphanumeric: sortFn_alphanumeric,
		basic: sortFn_basic,
		byValue: sortFn_byValue,
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
