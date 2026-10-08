import type { ColumnPinningState, TableFeature } from "@tanstack/svelte-table";

/** The ids of the columns that `defaultColumnPinning` pins. */
export const SELECT_COLUMN = "select";
const ACTIONS_COLUMN = "actions";

interface ColumnDefLike {
	id?: string;
	accessorKey?: unknown;
	enablePinning?: boolean;
	columns?: ColumnDefLike[];
}

const leaves = (defs: readonly ColumnDefLike[]): ColumnDefLike[] =>
	defs.flatMap((def) => (def.columns?.length ? leaves(def.columns) : [def]));

const idOf = (def: ColumnDefLike) =>
	def.id ?? (typeof def.accessorKey === "string" ? def.accessorKey : undefined);

/**
 * The pinning every data table starts with: the row-selection column (if it comes first) and the
 * column that identifies the row (the first one after it, e.g. the number or name) at the start,
 * and the row actions at the end, so they stay in view while the rest scrolls sideways. A column
 * opts out with `enablePinning: false`, and an identifying column that does keeps the selection
 * column unpinned too.
 */
export function defaultColumnPinning(defs: readonly ColumnDefLike[]): ColumnPinningState {
	const columns = leaves(defs).filter((def) => idOf(def) !== undefined);
	const start: string[] = [];
	const leading = columns[0] && idOf(columns[0]) === SELECT_COLUMN ? 1 : 0;
	const identifying = columns[leading];
	if (identifying && identifying.enablePinning !== false) {
		start.push(...columns.slice(0, leading + 1).map((def) => idOf(def)!));
	}
	const last = columns.at(-1);
	const end =
		last && last !== identifying && idOf(last) === ACTIONS_COLUMN && last.enablePinning !== false
			? [ACTIONS_COLUMN]
			: [];
	return { start, end };
}

/**
 * Starts every table with `defaultColumnPinning` of its columns, unless it sets
 * `initialState.columnPinning` itself (e.g. `{ start: [], end: [] }` for none), controls the
 * pinning, or turns it off with `enableColumnPinning: false`. Register it after
 * `columnPinningFeature`.
 */
export const defaultColumnPinningFeature: TableFeature = {
	initTableInstanceData: (table) => {
		const options = table.options as {
			columns: readonly ColumnDefLike[];
			enableColumnPinning?: boolean;
			initialState?: { columnPinning?: ColumnPinningState };
			state?: { columnPinning?: ColumnPinningState };
		};
		if (options.enableColumnPinning === false) return;
		if (options.initialState?.columnPinning || options.state?.columnPinning) return;
		const atom = (
			table.baseAtoms as { columnPinning?: { set: (value: ColumnPinningState) => void } }
		).columnPinning;
		if (!atom) return;
		const pinning = defaultColumnPinning(options.columns);
		(table.initialState as { columnPinning?: ColumnPinningState }).columnPinning = pinning;
		atom.set(pinning);
	},
};
