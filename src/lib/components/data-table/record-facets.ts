import type { RowData, SvelteTable } from "@tanstack/svelte-table";

import type { Features } from "./features.js";

/** A related record of a row, e.g. its customer: its filter value, name and code. */
export interface RowRecord {
	/** The filter value, e.g. the customer's code. */
	value: string;
	label: string;
	/** Shown after the label, e.g. the code (the search finds it by it too). */
	detail?: string;
}

/**
 * The options and counts of a `FacetedFilter` on related records (e.g. the customer) in a table
 * that filters in the browser: every record the rows have, by name, and how many rows each has
 * among those the search and the other filters leave. The column filters by `record(row).value`.
 */
export function recordFacets<TData extends RowData>(
	table: SvelteTable<Features, TData>,
	columnId: string,
	record: (row: TData) => RowRecord,
) {
	const options = new Map<string, RowRecord>();
	for (const row of table.getCoreRowModel().rows) {
		const found = record(row.original);
		if (!options.has(found.value)) options.set(found.value, found);
	}
	const counts = new Map<string, number>();
	for (const row of table.getColumn(columnId)?.getFacetedRowModel().rows ?? []) {
		const { value } = record(row.original);
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return {
		options: [...options.values()].sort(
			(a, b) => a.label.localeCompare(b.label) || (a.detail ?? "").localeCompare(b.detail ?? ""),
		),
		counts,
	};
}
