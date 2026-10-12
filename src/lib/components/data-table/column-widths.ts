/**
 * Stable column widths (see `column-widths.svelte.ts` for how a table uses this): per column, the
 * widest cells the table has seen, kept as what to render in them (a row and the column's value),
 * so the table can lay its columns out as if all that data were on the page.
 *
 * The browser's automatic table layout sizes a column from two widths of its cells: their
 * max-content width (the cell on one line) and their min-content width (wrapped at every
 * opportunity, e.g. its longest word). So per column the memory keeps the cell with the widest of
 * each, which may be one and the same.
 */

/** What a cell shows: a row's data and the column's value (which may be put in for the row's own). */
export interface Sample<TData> {
	original: TData;
	value: unknown;
}

/** A cell the memory keeps, and its width. */
interface Kept<TData> {
	width: number;
	sample: Sample<TData>;
}

/** Per column id, its cells with the widest max-content and min-content widths. */
export type WidthMemory<TData> = Record<string, { max: Kept<TData>; min: Kept<TData> }>;

/** A cell measured on the page (or among the hidden rows): its widths in pixels. */
export interface Measured<TData> {
	column: string;
	sample: Sample<TData>;
	max: number;
	min: number;
}

/**
 * Below this many pixels' difference a cell isn't wider: measuring rounds, and a cell that's kept
 * shouldn't be replaced by its own copy.
 */
const tolerance = 0.5;

/**
 * The memory with the measured cells learned: each column keeps whichever cell is widest, as
 * before or as measured. The same memory when nothing is wider, so a caller can tell.
 */
export function learn<TData>(
	memory: WidthMemory<TData>,
	measured: readonly Measured<TData>[],
): WidthMemory<TData> {
	let next = memory;
	for (const cell of measured) {
		const kept = next[cell.column];
		const max = !kept || cell.max > kept.max.width + tolerance;
		const min = !kept || cell.min > kept.min.width + tolerance;
		if (!max && !min) continue;
		if (next === memory) next = { ...memory };
		next[cell.column] = {
			max: max ? { width: cell.max, sample: cell.sample } : kept.max,
			min: min ? { width: cell.min, sample: cell.sample } : kept.min,
		};
	}
	return next;
}

/**
 * The hidden rows to render: per column, the cells to show in it, packed into as few rows as
 * there are cells per column (two at most: the widest on one line, and the widest when wrapped,
 * when that's another cell). Columns without memory are left out (their cells are empty).
 */
export function hiddenRows<TData>(
	memory: WidthMemory<TData>,
	columns: readonly string[],
): Map<string, Sample<TData>>[] {
	const rows = [new Map<string, Sample<TData>>(), new Map<string, Sample<TData>>()];
	for (const column of columns) {
		const kept = memory[column];
		if (!kept) continue;
		rows[0].set(column, kept.max.sample);
		if (kept.min.sample !== kept.max.sample) rows[1].set(column, kept.min.sample);
	}
	return rows.filter((row) => row.size > 0);
}

/**
 * What the widths depend on besides the data: the visible columns, the density and the language.
 * The memory starts over when it changes.
 */
export const widthContext = (context: {
	columns: readonly string[];
	density: string;
	locale: string;
}) => `${context.locale}|${context.density}|${context.columns.join(",")}`;
