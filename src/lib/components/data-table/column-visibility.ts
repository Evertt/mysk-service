/**
 * Which of a table's columns are shown, as the app remembers it for a user (see
 * `table-memory.svelte.ts`) and as a saved view keeps it (see `views.ts`): the visibility of each
 * of the table's hideable columns, by id, e.g. `{ createdAt: true, total: false }`.
 *
 * A saved visibility is read against the table's columns now: a column it doesn't know (e.g. one a
 * module added since) gets its default, and one the table no longer has is ignored.
 */

export type ColumnVisibility = Record<string, boolean>;

/** The most columns a saved visibility holds (a table has far fewer). */
export const columnVisibilityMax = 100;

/** What the visibility needs of a table (TanStack Table's). */
interface VisibilityTable {
	initialState: { columnVisibility?: ColumnVisibility };
	getAllLeafColumns(): { id: string; getCanHide(): boolean; accessorFn?: unknown }[];
	atoms: { columnVisibility: { get(): ColumnVisibility | undefined } };
	setColumnVisibility(visibility: ColumnVisibility): void;
}

/** The table's hideable columns' visibility by default (its initial state's, else shown). */
export function defaultVisibility(table: VisibilityTable): ColumnVisibility {
	const initial = table.initialState.columnVisibility ?? {};
	return Object.fromEntries(
		table
			.getAllLeafColumns()
			.filter((column) => column.accessorFn && column.getCanHide())
			.map((column) => [column.id, initial[column.id] ?? true]),
	);
}

/** The table's hideable columns' visibility now. */
export function currentVisibility(table: VisibilityTable): ColumnVisibility {
	const state = table.atoms.columnVisibility.get() ?? {};
	return Object.fromEntries(
		Object.keys(defaultVisibility(table)).map((id) => [id, state[id] ?? true]),
	);
}

/**
 * A saved visibility read against the defaults: the saved one's for the columns it has, the
 * default for the others (its other columns are left out).
 */
export const withSaved = (
	defaults: ColumnVisibility,
	saved: ColumnVisibility | null | undefined,
): ColumnVisibility =>
	Object.fromEntries(Object.entries(defaults).map(([id, visible]) => [id, saved?.[id] ?? visible]));

/** Whether two visibilities of the same columns (`a`'s) show the same ones. */
export const sameVisibility = (a: ColumnVisibility, b: ColumnVisibility) =>
	Object.entries(a).every(([id, visible]) => (b[id] ?? true) === visible);

/** What to remember of a visibility: `null` if it's the default, else all of it. */
export const changedVisibility = (defaults: ColumnVisibility, current: ColumnVisibility) =>
	sameVisibility(defaults, current) ? null : current;

/** Shows the columns a memory or a view has (and the defaults for those it doesn't). */
export function showColumns(table: VisibilityTable, saved: ColumnVisibility | null | undefined) {
	table.setColumnVisibility({
		...table.atoms.columnVisibility.get(),
		...withSaved(defaultVisibility(table), saved),
	});
}
