/**
 * The search box of the tables whose rows are all in the browser (customers, engineers, the
 * contracts and invoices modules' lists): a row is kept when each word of the search
 * (`searchWords()`) is in one of its searched columns, the words in any of them. That's the server
 * lists' rule (`searchMatch()`), so "Bakker Tiel" finds the customer Bakker in Tiel on every list.
 *
 * Which columns are searched is TanStack's: those of text or numbers (by their first value) unless
 * they say `enableGlobalFilter: false`, and any other that says `enableGlobalFilter: true` (e.g. a
 * day). Each is searched as the text its cell shows: an enum by its name in the current language
 * (the column's `meta.clickFilter`), a day or moment as `formatDate` shows it, anything else as
 * text.
 */
import { constructFilterFn } from "@tanstack/svelte-table";

import { formatDate } from "#lib/i18n/format.ts";

import type { DataTableColumnMeta } from "./features.ts";
import { searchWords } from "./search-words.ts";

/** What the filter needs of a column (TanStack's). */
interface SearchedColumn {
	id: string;
	columnDef: { meta?: DataTableColumnMeta };
	getCanGlobalFilter(): boolean;
}

/** What the filter needs of a table (TanStack's). */
interface SearchedTable {
	getAllLeafColumns(): readonly SearchedColumn[];
	getCoreRowModel(): object;
}

/**
 * Each table's searched columns, for its columns and rows (TanStack keeps both until they change):
 * whether a column is searched may depend on its values (see above), which TanStack looks up
 * among the rows, too slow to ask for each row.
 */
const searchedOf = new WeakMap<
	SearchedTable,
	{ columns: readonly SearchedColumn[]; rows: object; searched: readonly SearchedColumn[] }
>();

function searchedColumns(table: SearchedTable) {
	const columns = table.getAllLeafColumns();
	const rows = table.getCoreRowModel();
	const known = searchedOf.get(table);
	if (known?.columns === columns && known.rows === rows) return known.searched;
	const searched = columns.filter((column) => column.getCanGlobalFilter());
	searchedOf.set(table, { columns, rows, searched });
	return searched;
}

/** A cell's value as the search reads it: as its cell shows it (see above). */
function shownText(value: unknown, meta: DataTableColumnMeta | undefined) {
	if (value === null || value === undefined) return "";
	if (typeof value === "string" && meta?.clickFilter) return meta.clickFilter(value);
	if (value instanceof Temporal.PlainDate || value instanceof Temporal.Instant) {
		return formatDate(value);
	}
	return String(value);
}

/**
 * The table's `globalFilterFn` (registered as `allWords`): keeps the rows that have each word of
 * the search in one of their searched columns.
 *
 * TanStack's global filter calls it once per searched column, and keeps the row if any call says
 * so: "this column matches", which can't say "each word is in some column". So it answers for the
 * whole row (all its searched columns' text) at the row's first searched column, and `false` at
 * the others: TanStack calls the first one for every row, and stops at a `true`. The row's answer
 * is then TanStack's own, which the filters' counts read too (`createFacetedRowModel`). The
 * alternatives: a hidden column joining the others' text, in every table and kept in step with its
 * columns; or filtering the rows ahead of TanStack, whose counts would then ignore the search.
 */
export const filterFn_allWords = constructFilterFn({
	filter: (_value: unknown, words: string[], row, columnId) => {
		const columns = searchedColumns(row.table as unknown as SearchedTable);
		if (columnId !== columns[0]?.id) return false;
		// A column a line, so a word is never found across two.
		const text = columns
			.map((column) => shownText(row.getValue(column.id), column.columnDef.meta))
			.join("\n")
			.toLocaleLowerCase();
		return words.every((word) => text.includes(word));
	},
	resolveFilterValue: (text: unknown) =>
		searchWords(String(text)).map((word) => word.toLocaleLowerCase()),
});
