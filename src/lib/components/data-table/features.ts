import {
	columnFacetingFeature,
	columnFilteringFeature,
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
export const features = tableFeatures({
	rowSortingFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	columnFilteringFeature,
	columnFacetingFeature,
	columnVisibilityFeature,
	globalFilteringFeature,
	columnMeta: metaHelper<DataTableColumnMeta>(),
	sortedRowModel: createSortedRowModel(),
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

export type Features = typeof features;
