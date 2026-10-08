/**
 * Grouping a data table's rows by a column (`?group=category`, see `url-state.ts`): rows with the
 * same value of the column follow each other, under a header row with the group's value and how
 * many rows it has.
 *
 * Grouping arranges a page rather than replacing pagination: the rows are sorted by the grouped
 * column first (then as the table is sorted), and paged as usual, so a group can start on one page
 * and go on on the next. That works the same for server-side tables, whose server sorts the same
 * way (see `planList`) and says what it knows beyond the page (`PageGroups`): how many rows each
 * group has in all, and the rows just before and after the page. A group header never claims more
 * than that: its count is the group's whole count, and a group cut off by the page says so.
 *
 * A column opts in with `enableGrouping: true` (the app's tables default to `false`).
 */
import { createSortedRowModel } from "@tanstack/svelte-table";

/** A group's key: its value as text, `""` for none. Server and client key groups the same way. */
export function groupKey(value: unknown): string {
	if (value === null || value === undefined) return "";
	// Grouping values are text, numbers or booleans (an object would group as one).
	return String(value as string | number | boolean);
}

/**
 * What a server-side table's server tells about the groups of a page (when grouped), which the
 * page's rows alone can't.
 */
export interface PageGroups<TData = unknown> {
	/** How many rows each group has (by `groupKey`), under the current search and filters. */
	counts: Record<string, number>;
	/** The row before the page, if any, to tell whether its first group started earlier. */
	previous?: TData;
	/** The row after the page, if any, to tell whether its last group goes on. */
	next?: TData;
}

/** A group of rows on a page. */
export interface PageGroup<Row> {
	key: string;
	/** Its rows on this page, in order. */
	rows: Row[];
	/** How many rows it has in all, on every page. */
	count: number;
	/** It started on an earlier page. */
	continued: boolean;
	/** It goes on on a later page. */
	continues: boolean;
}

/**
 * A page's rows in their groups, in order. `around` says what's known beyond the page: each
 * group's whole count (else the rows on the page), and the keys of the rows just before and
 * after it. Rows of a group that aren't together (which sorting by the group first prevents) join
 * the group's first rows.
 */
export function pageGroups<Row>(
	rows: readonly Row[],
	keyOf: (row: Row) => string,
	around: { counts?: Readonly<Record<string, number>>; previous?: string; next?: string } = {},
): PageGroup<Row>[] {
	const byKey = new Map<string, Row[]>();
	for (const row of rows) {
		const key = keyOf(row);
		const group = byKey.get(key);
		if (group) group.push(row);
		else byKey.set(key, [row]);
	}
	const groups = [...byKey].map(([key, rows]) => ({
		key,
		rows,
		count: Math.max(around.counts?.[key] ?? rows.length, rows.length),
		continued: false,
		continues: false,
	}));
	if (groups.length) {
		groups[0].continued = around.previous !== undefined && around.previous === groups[0].key;
		const last = groups.at(-1)!;
		last.continues = around.next !== undefined && around.next === last.key;
	}
	return groups;
}

/** The sum of a column's numbers over rows, ignoring what isn't a number. */
export function sumOf<Row>(rows: readonly Row[], valueOf: (row: Row) => unknown): number {
	let sum = 0;
	for (const row of rows) {
		const value = valueOf(row);
		if (typeof value === "number" && Number.isFinite(value)) sum += value;
	}
	return sum;
}

/** What `sortGroupsFirst` needs of a row. */
interface SortableRow {
	getValue(columnId: string): unknown;
	getGroupingValue(columnId: string): unknown;
}

/** What `sortGroupsFirst` needs of a column. */
interface SortableColumn {
	id: string;
	getCanSort(): boolean;
	getSortFn(): (a: never, b: never, columnId: string) => number;
	columnDef: { sortUndefined?: false | -1 | 1 | "first" | "last"; invertSorting?: boolean };
}

/**
 * The rows with each group's rows together, the groups in the order of the grouped column's
 * sorting (descending if the table sorts by the column descending, else ascending), and each
 * group's rows in their order: the same as sorting by the grouped column first.
 */
export function groupsFirst<Row extends SortableRow>(
	rows: readonly Row[],
	column: SortableColumn,
	desc: boolean,
): Row[] {
	const byKey = new Map<string, Row[]>();
	for (const row of rows) {
		const key = groupKey(row.getGroupingValue(column.id));
		const group = byKey.get(key);
		if (group) group.push(row);
		else byKey.set(key, [row]);
	}
	const groups = [...byKey.values()];
	if (column.getCanSort()) {
		const sortFn = column.getSortFn() as unknown as (a: Row, b: Row, id: string) => number;
		const { sortUndefined, invertSorting } = column.columnDef;
		const compare = (a: Row, b: Row) => {
			if (sortUndefined) {
				const aUndefined = a.getValue(column.id) === undefined;
				const bUndefined = b.getValue(column.id) === undefined;
				if (aUndefined && bUndefined) return 0;
				if (aUndefined || bUndefined) {
					if (sortUndefined === "first") return aUndefined ? -1 : 1;
					if (sortUndefined === "last") return aUndefined ? 1 : -1;
					const result = aUndefined ? sortUndefined : -sortUndefined;
					return desc ? -result : result;
				}
			}
			const result = sortFn(a, b, column.id) * (desc ? -1 : 1);
			return invertSorting ? -result : result;
		};
		groups.sort((a, b) => compare(a[0], b[0]));
	}
	return groups.flat();
}

/** What the grouping needs of the table, to sort its rows by their groups. */
interface GroupingTable {
	atoms: {
		grouping?: { get(): string[] };
		sorting?: { get(): { id: string; desc: boolean }[] };
	};
	getColumn(id: string): unknown;
}

type SortedRowModelFactory = ReturnType<typeof createSortedRowModel>;

/**
 * TanStack's sorted row model, with the rows of each group together when the table is grouped
 * (see `groupsFirst`), before they're paged: the client-side half of grouping (the server sorts a
 * server-side table's rows the same way). It doesn't group rows into sub-rows (TanStack's grouped
 * row model), which would page the groups rather than the rows.
 */
export function sortGroupsFirst(sorted: SortedRowModelFactory): SortedRowModelFactory {
	return ((table: GroupingTable) => {
		const rowModel = (sorted as unknown as (table: GroupingTable) => () => RowModelLike)(table);
		let cached: { input: RowModelLike; columnId: string; desc: boolean; output: RowModelLike };
		return () => {
			const input = rowModel();
			const columnId = table.atoms.grouping?.get()[0];
			const column = columnId
				? (table.getColumn(columnId) as SortableColumn | undefined)
				: undefined;
			if (!columnId || !column) return input;
			const desc = table.atoms.sorting?.get().find((sort) => sort.id === columnId)?.desc ?? false;
			if (cached?.input === input && cached.columnId === columnId && cached.desc === desc) {
				return cached.output;
			}
			const rows = groupsFirst(input.rows as SortableRow[], column, desc);
			const output = { ...input, rows, flatRows: rows };
			cached = { input, columnId, desc, output };
			return output;
		};
	}) as unknown as SortedRowModelFactory;
}

interface RowModelLike {
	rows: unknown[];
	flatRows: unknown[];
	rowsById: Record<string, unknown>;
}
