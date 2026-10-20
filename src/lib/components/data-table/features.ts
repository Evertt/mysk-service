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
import type { Component } from "svelte";

import { defaultColumnPinningFeature } from "./default-pinning.ts";
import { sortGroupsFirst } from "./grouping.ts";
import { inAnyRange, type RangeGrammar } from "./ranges.ts";
import { filterFn_allWords } from "./search-filter.ts";
import { noneToken } from "./url-state.ts";

/** An option of a filter on a fixed set of values (`FacetedFilter`), e.g. a status. */
export interface FilterOption {
	value: string;
	label: string;
	icon?: Component;
	/** What the search box finds it by, if not only its label, e.g. a customer's code too. */
	keywords?: string[];
	/**
	 * How many rows have it, rather than the filter's `counts`; greyed at 0, as a `RecordFilter`'s
	 * options are (`recordFacets()`' options have it).
	 */
	count?: number;
}

/**
 * A column's meta. What its list's definition says (`param`, `filter`, `filterValues`,
 * `filterNone`) a list's table takes from it (`withListColumns()`), never from its own columns.
 */
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
	 * The options of its filter (`FacetedFilter`, in `ListToolbar`) when it has a fixed set of
	 * values, e.g. an enum's (`column.enum()`), each with its label and icon.
	 */
	filterOptions?: readonly FilterOption[];
	/**
	 * What its rows without a value are called, e.g. "Unassigned": its filter's option for them, if
	 * it takes `none` (`orNone()`). A message function, read when shown.
	 */
	none?: () => string;
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
	 * record's page keeps its link instead. A cell without a value (`null`) isn't clickable. The
	 * search box finds the value by this name too (see `search-filter.ts`).
	 */
	clickFilter?: (value: string) => string;
}

/** What the helpers below read of a column (one of TanStack's). */
interface MetaColumn {
	id: string;
	columnDef: { meta?: DataTableColumnMeta };
}

/** A column's name as shown: its translated `meta.label`, or its id. */
export function columnLabel(column: MetaColumn) {
	const label = column.columnDef.meta?.label;
	return (typeof label === "function" ? label() : label) ?? column.id;
}

/** What a column calls its rows without a value: its `meta.none`, or a generic "(None)". */
export const noneLabel = (column: MetaColumn | undefined) =>
	column?.columnDef.meta?.none?.() ?? m.common_table_filter_none();

/**
 * What a column's filter calls the rows without a value (`noneLabel()`), if it takes `none`
 * (`orNone()`); `undefined` for a filter that doesn't.
 */
export const columnNone = (column: MetaColumn | undefined) =>
	column?.columnDef.meta?.filterNone ? noneLabel(column) : undefined;

/**
 * Keeps rows whose value is one of the selected values (used by the faceted filters), as the URL
 * has them: the row's grouping value (`getGroupingValue`, e.g. a customer's code where the column
 * shows the name; else its value) as text. Rows without one (`null` or `undefined`) are kept by
 * `none` (`noneToken`, the filter's `none` option).
 */
const filterFn_oneOf = constructFilterFn({
	filter: (_value: unknown, filterValue: unknown[], row, columnId) => {
		const value: unknown = row.getGroupingValue(columnId);
		return filterValue.includes(
			value === null || value === undefined ? noneToken : String(value as string | number),
		);
	},
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
		// The search box's (`globalFilterFn`, see `search-filter.ts`).
		allWords: filterFn_allWords,
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
