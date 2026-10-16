import { type Cell, constructRow, type RowData } from "@tanstack/svelte-table";
import * as devalue from "devalue";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";

import { getTimeZone, temporalReducers, temporalRevivers } from "#lib/dates.ts";
import { getLocale } from "#lib/paraglide/runtime.js";

import { hiddenRows, learn, type Sample, widthContext, type WidthMemory } from "./column-widths.ts";
import { tableDensity } from "./density.svelte.ts";
import type { Features } from "./features.ts";
import { noneToken } from "./url-state.ts";

/** What the widths need of a column (TanStack Table's). */
interface WidthsColumn {
	id: string;
	accessorFn?: unknown;
	getIsGrouped(): boolean;
	columnDef: { meta?: { filterValues?: readonly string[] } };
}

/** What the widths need of the table (TanStack Table's). */
interface WidthsTable<TData extends RowData> {
	getVisibleLeafColumns(): WidthsColumn[];
	getRowModel(): { rows: { id: string; original: TData; getValue(id: string): unknown }[] };
	atoms: {
		sorting: { get(): unknown };
		columnFilters: { get(): unknown };
		globalFilter: { get(): unknown };
		grouping: { get(): unknown };
	};
}

/**
 * A hidden row: per column, the cell to render in it (for `FlexRender`), and an attachment for the
 * `<td>` it's rendered in.
 */
export type HiddenRow = Map<
	string,
	{ cell: Cell<Features, RowData, any>; attach?: Attachment<HTMLElement> }
>;

// --- The memory, for a visit ---------------------------------------------------------------------

/** Where a table's memory is kept for the visit. */
const storageKey = (key: string) => `data-table-widths:${key}`;

/** What's stored: the memory, and what it was learned for (see `widthContext`). */
interface Stored<TData> {
	context: string;
	memory: WidthMemory<TData>;
}

function load<TData>(key: string, context: string): WidthMemory<TData> | undefined {
	try {
		const stored = sessionStorage.getItem(storageKey(key));
		if (!stored) return;
		const parsed = devalue.parse(stored, temporalRevivers) as Stored<TData>;
		return parsed.context === context ? parsed.memory : undefined;
	} catch {
		// No storage (e.g. blocked), or something it can't read: start over.
		return undefined;
	}
}

function save<TData>(key: string, context: string, memory: WidthMemory<TData>) {
	try {
		sessionStorage.setItem(
			storageKey(key),
			devalue.stringify({ context, memory }, temporalReducers),
		);
	} catch {
		// No storage, no room in it, or rows it can't hold: the memory lasts as long as the table.
	}
}

// --- Measuring ------------------------------------------------------------------------------------

type Widths = { max: number; min: number };

/**
 * Measures the widths of cells, on one line (max-content) and wrapped wherever they can be
 * (min-content), as the table's automatic layout sees them: on copies, off-screen, next to the
 * table (so in its styles, and its text's). Copies are costly (the browser styles each anew), so a cell that looks
 * like one measured before (the same classes and contents, as many do: a status, a date) isn't
 * measured again.
 */
function cellMeasurer() {
	const known = new Map<string, Widths>();
	return (cells: HTMLElement[], table: HTMLElement): Widths[] => {
		const keys = cells.map((cell) => `${cell.className}\n${cell.innerHTML}`);
		const fresh = new Map<string, HTMLElement>();
		keys.forEach((key, index) => {
			if (!known.has(key) && !fresh.has(key)) fresh.set(key, cells[index]);
		});
		if (fresh.size) {
			const box = document.createElement("div");
			box.setAttribute("aria-hidden", "true");
			// Laid out (`display: none` isn't), but out of view and of the page's layout.
			box.style.cssText =
				"position:absolute;top:0;left:0;width:0;height:0;overflow:hidden;visibility:hidden;contain:strict";
			// The table's text, which the cells inherit.
			const { font, letterSpacing } = getComputedStyle(table);
			Object.assign(box.style, { font, letterSpacing });
			const copies = [...fresh.values()].map((cell) => {
				const copy = cell.cloneNode(true) as HTMLElement;
				copy.style.cssText = "display:block;position:absolute;width:max-content";
				return copy;
			});
			box.append(...copies);
			table.after(box);
			// Read all, then write all: two layouts in all.
			const max = copies.map((copy) => copy.getBoundingClientRect().width);
			for (const copy of copies) copy.style.width = "min-content";
			const min = copies.map((copy) => copy.getBoundingClientRect().width);
			box.remove();
			[...fresh.keys()].forEach((key, index) =>
				known.set(key, { max: max[index], min: min[index] }),
			);
		}
		return keys.map((key) => known.get(key)!);
	};
}

/** The header cells' widths, by column id. */
function headerWidths(table: HTMLElement) {
	const widths: Record<string, number> = {};
	for (const th of table.querySelectorAll<HTMLElement>(
		":scope > thead > tr > th[data-column-id]",
	)) {
		widths[th.dataset.columnId!] = th.getBoundingClientRect().width;
	}
	return widths;
}

// --- Known values ---------------------------------------------------------------------------------

/**
 * The values a column's cells can have that are known up front, to start its width right (`value`
 * is one of its cells'): for a column of strings, its filter's options (`meta.filterValues`); for a
 * column of dates, the 28th of every month (the longest month names, two-digit days, a late hour
 * for a format with the time). A filter's options on a column of other values (e.g. buckets of
 * dates, `overdue`) aren't its cells' values.
 */
function knownValues(column: WidthsColumn, value: unknown): unknown[] {
	if (typeof value === "string") {
		return column.columnDef.meta?.filterValues?.filter((option) => option !== noneToken) ?? [];
	}
	if (value instanceof Temporal.PlainDate) {
		return Array.from({ length: 12 }, (_, month) => value.with({ month: month + 1, day: 28 }));
	}
	if (value instanceof Temporal.Instant) {
		const zoned = value.toZonedDateTimeISO(getTimeZone());
		return Array.from({ length: 12 }, (_, month) =>
			zoned.with({ month: month + 1, day: 28, hour: 23, minute: 58 }).toInstant(),
		);
	}
	return [];
}

type WidthsRow<TData extends RowData> = ReturnType<
	WidthsTable<TData>["getRowModel"]
>["rows"][number];

/**
 * Hidden rows that try each column's known values once (see `knownValues`), in the first of the
 * page's rows with a value in the column.
 */
function candidatesOf<TData extends RowData>(
	columns: readonly WidthsColumn[],
	rows: readonly WidthsRow<TData>[],
) {
	const candidates: Map<string, Sample<TData>>[] = [];
	for (const column of columns) {
		const row = rows.find((row) => row.getValue(column.id) != null);
		if (!row) continue;
		knownValues(column, row.getValue(column.id)).forEach((value, index) => {
			(candidates[index] ??= new Map()).set(column.id, { original: row.original, value });
		});
	}
	return candidates;
}

// --- The table's widths ---------------------------------------------------------------------------

/**
 * Stable column widths for a data table (`data-table.svelte`): its columns are as wide as the
 * widest cells it has seen, rather than as the rows' in view, so they don't change as more rows
 * come.
 *
 * Per column, the table keeps the cells with the widest contents it has shown (see
 * `column-widths.ts`), measured once they're painted, and renders them in `rows`: hidden rows (in
 * a `<tfoot>` of their own, `inert` and `aria-hidden`, with `visibility: collapse`, which gives
 * them no height but keeps their cells in the columns' widths), so the browser lays the columns
 * out as if all that data were on the page. The cells are rendered with the columns' own `cell`s,
 * on rows made for the purpose (TanStack's `constructRow`): they're in none of the table's row
 * models, so selection, counts, grouping and keyboard navigation never see them. A filter, search,
 * sort or grouping lays the new rows out with them, and the widths settle on what the table would
 * pick with everything seen loaded at once.
 *
 * More rows as the table scrolls (more of the same rows, `scroll.key` unchanged) don't even do that:
 * `frozen` holds the columns' widths from just before, which `data-table.svelte` pins (a
 * `<colgroup>`, `table-layout: fixed`), until anything else changes; the hidden rows learn from the
 * new rows in the meantime.
 *
 * Columns whose values are known up front start right: their filter's options and dates (see
 * `knownValues`) are tried once in hidden rows (also when the server renders the table), in the
 * current language, and the widest kept.
 *
 * The memory starts over when columns are hidden or shown, or the density or language changes,
 * and lasts a visit: `key` (the table's and its owner's, so the rows of one organization or member
 * are never shown to another in the same tab) keeps it in `sessionStorage` (if there is any, and a
 * key; else it lasts as long as the table). `scroll` says what the rows are for (`key`, the scroll
 * window's key, see `scroll-window.svelte.ts`): when it changes, the rows are others; and whether
 * more are on their way (`growing`), which freezes the widths before they come. Attach
 * `attach` to the `<table>`, whose header cells and cells have `data-column-id` and rows
 * `data-row-id`, and each hidden cell's `attach` to its `<td>`.
 */
export function columnWidths<TData extends RowData>(
	table: WidthsTable<TData>,
	key: () => string | undefined,
	scroll: { key?: () => string | undefined; growing?: () => boolean } = {},
) {
	/** The columns whose cells show data (not the selection or the actions). */
	const columns = $derived(
		table.getVisibleLeafColumns().filter((column) => column.accessorFn && !column.getIsGrouped()),
	);
	const context = $derived(
		widthContext({
			columns: table.getVisibleLeafColumns().map((column) => column.id),
			density: tableDensity.current,
			locale: getLocale(),
		}),
	);

	/** The context the memory is for, once the browser has it. */
	let started: string | undefined;
	let measure = cellMeasurer();
	let memory = $state.raw<WidthMemory<TData>>({});
	/** Cells to try once (see `candidatesOf`): on the server too, to start right. */
	let candidates = $state.raw(untrack(() => candidatesOf(columns, table.getRowModel().rows)));
	/** Whether the candidates were made from rows (there are none to make them from without). */
	let seeded = untrack(() => table.getRowModel().rows.length > 0);

	/** Starts (over) with the memory of `context`, and new candidates. */
	function start(context: string) {
		started = context;
		measure = cellMeasurer();
		const storage = key();
		memory = (storage && load<TData>(storage, context)) || {};
		candidates = candidatesOf(columns, table.getRowModel().rows);
		seeded = table.getRowModel().rows.length > 0;
	}

	let element = $state<HTMLTableElement>();
	/** The columns' widths while more rows come (see above), by column id. */
	let frozen = $state.raw<Record<string, number>>();

	// In the browser, a table rendered there starts at once; one the server rendered (whose memory
	// the server doesn't have) once it's hydrated (see the root layout's `data-hydrated`).
	if (typeof document !== "undefined" && "hydrated" in document.documentElement.dataset) {
		untrack(() => start(context));
	}
	$effect(() => {
		const current = context;
		const rows = table.getRowModel().rows;
		untrack(() => {
			if (started !== current) start(current);
			else if (!seeded && rows.length) {
				candidates = candidatesOf(columns, rows);
				seeded = true;
			}
		});
	});

	/** A cell showing a sample: on a row made for it, which none of the table's row models has. */
	function cellOf(sample: Sample<TData>, column: string) {
		const row = constructRow(table as never, "hidden", sample.original, -1, 0) as unknown as {
			_valuesCache: Record<string, unknown>;
			getAllCellsByColumnId(): Record<string, Cell<Features, RowData, any>>;
		};
		// The value the column's `getValue()` answers, first looked for in the row's cache.
		row._valuesCache[column] = sample.value;
		return row.getAllCellsByColumnId()[column];
	}

	/** The candidates' cells as rendered, and what they show, to measure them. */
	const candidateCells = new Map<HTMLElement, { column: string; sample: Sample<TData> }>();

	/** Hidden rows from samples (with an attachment that keeps a candidate's cells to measure). */
	const hidden = (rows: Map<string, Sample<TData>>[], measured: boolean) =>
		rows.map(
			(row): HiddenRow =>
				new Map(
					[...row].map(([column, sample]) => [
						column,
						{
							cell: cellOf(sample, column),
							attach: measured
								? undefined
								: (td: HTMLElement) => {
										candidateCells.set(td, { column, sample });
										return () => void candidateCells.delete(td);
									},
						},
					]),
				),
		);

	const rows = $derived([
		...hidden(
			hiddenRows(
				memory,
				columns.map((column) => column.id),
			),
			true,
		),
		...hidden(candidates, false),
	]);

	/** Measures the page's cells and the hidden ones, and keeps the widest per column. */
	function learnFrom(element: HTMLTableElement) {
		const ids = new Set(columns.map((column) => column.id));
		const cells: HTMLElement[] = [];
		const found: { column: string; sample: Sample<TData> }[] = [];
		const body = element.querySelector(":scope > tbody[data-slot=table-body]");
		for (const row of table.getRowModel().rows) {
			const tr = body?.querySelector(`:scope > tr[data-row-id="${CSS.escape(row.id)}"]`);
			for (const td of tr?.querySelectorAll<HTMLElement>(":scope > td[data-column-id]") ?? []) {
				const column = td.dataset.columnId!;
				if (!ids.has(column)) continue;
				cells.push(td);
				found.push({ column, sample: { original: row.original, value: row.getValue(column) } });
			}
		}
		// The memory's cells were measured when they were the page's.
		for (const [td, candidate] of candidateCells) {
			if (!ids.has(candidate.column)) continue;
			cells.push(td);
			found.push(candidate);
		}
		const widths = measure(cells, element);
		const next = learn(
			memory,
			found.map((cell, index) => ({ ...cell, ...widths[index] })),
		);
		// The candidates are tried once.
		const tried = new Set(found.map((cell) => cell.sample));
		const untried = candidates.filter((row) => [...row.values()].some((s) => !tried.has(s)));
		if (untried.length !== candidates.length) candidates = untried;
		if (next === memory) return;
		memory = next;
		const storage = key();
		if (storage) save(storage, context, memory);
	}

	// After each render of other rows (or candidates): learn from their cells once they're painted,
	// as measuring takes the browser a moment (and changes nothing that's shown).
	$effect(() => {
		void table.getRowModel().rows;
		void candidates;
		const current = element;
		if (!current || started === undefined) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const frame = requestAnimationFrame(() => {
			timer = setTimeout(() => learnFrom(current));
		});
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(timer);
		};
	});

	/** What the layout depends on: a change lays the columns out again. */
	const layoutKey = $derived(
		JSON.stringify([
			table.atoms.sorting.get(),
			table.atoms.columnFilters.get(),
			table.atoms.globalFilter.get(),
			table.atoms.grouping.get(),
			scroll.key?.(),
			context,
		]),
	);
	let laidOut = { key: "", rows: -1 };
	// Before more rows render, while the columns are as they were.
	$effect.pre(() => {
		const current = { key: layoutKey, rows: table.getRowModel().rows.length };
		// About to grow: frozen before the new rows render (see above).
		const growing = scroll.growing?.() ?? false;
		untrack(() => {
			if (current.key !== laidOut.key) frozen = undefined;
			else if ((growing || current.rows > laidOut.rows) && laidOut.rows > 0 && !frozen && element) {
				frozen = headerWidths(element);
			}
			laidOut = current;
		});
	});

	const attach: Attachment<HTMLTableElement> = (table) => {
		element = table;
		return () => {
			element = undefined;
		};
	};

	return {
		/** The hidden rows, each a map from column id to the cell to render there. */
		get rows() {
			return rows;
		},
		/** The columns' widths, by id, while they're frozen (see above). */
		get frozen() {
			return frozen;
		},
		/** For the `<table>`. */
		attach,
	};
}
