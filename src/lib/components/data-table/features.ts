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
	/** Human readable column name, for the header and the column visibility menu. */
	label?: string;
	/** Right-align numeric columns. */
	align?: "start" | "end";
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
