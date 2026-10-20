import type { RowData, SvelteTable } from "@tanstack/svelte-table";

import type { Features } from "./features.ts";
import type { RecordOption, RecordOptions } from "./server-table.svelte.ts";

/** A related record of a row, e.g. its customer: its filter value, name and code. */
export interface RowRecord {
	/** The filter value, e.g. the customer's code. */
	value: string;
	label: string;
	/** What the filter's search also finds it by, e.g. the code; not shown. */
	detail?: string;
}

/**
 * The order of a filter's options on related records: most rows first, then by name. Those no row
 * has come last.
 */
export const byCount = (
	a: { label: string; count?: number },
	b: { label: string; count?: number },
) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label);

/**
 * The options of a `FacetedFilter` on related records (e.g. the customer) in a table that filters
 * in the browser, as a `RecordFilter` has them on a server-side list: every record the rows have,
 * with how many rows each has among those the search and the other filters leave, most first
 * (`byCount`), and greyed at 0. The column filters by `record(row).value`.
 */
function recordFacets<TData extends RowData>(
	table: SvelteTable<Features, TData>,
	columnId: string,
	record: (row: TData) => RowRecord,
) {
	const records = new Map<string, RowRecord>();
	for (const row of table.getCoreRowModel().rows) {
		const found = record(row.original);
		if (!records.has(found.value)) records.set(found.value, found);
	}
	const counts = new Map<string, number>();
	for (const row of table.getColumn(columnId)?.getFacetedRowModel().rows ?? []) {
		const { value } = record(row.original);
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...records.values()]
		.map(({ value, label, detail }) => ({
			value,
			label,
			count: counts.get(value) ?? 0,
			...(detail ? { keywords: [label, detail] } : {}),
		}))
		.sort(byCount);
}

/**
 * A `RecordFilter`'s options in the order it shows them: the option for rows without a value
 * (`none`, if offered), the ticked ones (`selected`, in the order they were ticked) that its search
 * didn't find, then what it found, in its order (most rows first, see `facetOptions()`). A ticked
 * one is named as `found` names it, with its count, else as it was seen before (`known`, without
 * its count, which may be another list's), else by its value.
 */
export function recordOptionsInOrder({
	none,
	selected,
	found,
	known,
}: {
	none?: RecordOption;
	selected: readonly string[];
	found: Pick<RecordOptions, "options" | "selected">;
	known: (value: string) => RecordOption | undefined;
}): RecordOption[] {
	const ticked = selected
		.filter((value) => !found.options.some((option) => option.value === value))
		.map((value): RecordOption => {
			const fresh = found.selected.find((option) => option.value === value);
			if (fresh) return fresh;
			const seen = known(value);
			return seen ? { value, label: seen.label, detail: seen.detail } : { value, label: value };
		});
	return [...(none ? [none] : []), ...ticked, ...found.options];
}

/**
 * The options of a client-side list's customer filter (`recordFacets()`): its rows' customers, by
 * code (the filter's value, the column's grouping value), named, and found by their code too.
 */
export function customerFacets<
	TData extends RowData & { customer: { code: string; name: string } },
>(table: SvelteTable<Features, TData>, columnId = "customer") {
	return recordFacets(table, columnId, (row) => ({
		value: row.customer.code,
		label: row.customer.name,
		detail: row.customer.code,
	}));
}
