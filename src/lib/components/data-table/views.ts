/**
 * Saved views: a table's search, filters, sorting and grouping (its URL parameters, see
 * `url-state.ts`, without where it's scrolled to) and its columns saved under a name, to get back to in one
 * click. The parameters are stored as the query string the table writes, so they work for any
 * table that keeps its state in the URL, and are read back through the table's own grammar: a
 * parameter the table no longer knows is ignored, like in a link. The columns are the visibility
 * of the table's hideable columns (see `column-visibility.ts`): a column the view doesn't know
 * (e.g. one a module added since) gets its default.
 */
import { type ColumnVisibility, sameVisibility, withSaved } from "./column-visibility.ts";
import { parseTableUrl, tableUrlKey, type TableUrlSpec, type TableUrlState } from "./url-state.ts";

/** The longest name a view can have. */
export const viewNameMax = 60;

/** The longest query a view can save (a table's parameters are much shorter). */
export const viewQueryMax = 4000;

/** Whether a member with these roles may share views with the organization, and change shared ones. */
export const canShareViews = (roles: readonly string[]) =>
	roles.some((role) => role === "owner" || role === "admin");

/**
 * Which table a view belongs to: its route (e.g. `/(app)/orders`), plus its URL prefix on a page
 * with more than one table.
 */
export const tableViewsKey = (route: string, prefix?: string) =>
	prefix ? `${route}#${prefix}` : route;

/** What a view saves of a table's state: its parameters, e.g. `?status=quote`. */
export const viewQuery = (state: TableUrlState, spec: TableUrlSpec) => tableUrlKey(state, spec);

/** The table's state a saved query stands for. */
export const viewState = (query: string, spec: TableUrlSpec) =>
	parseTableUrl(new URLSearchParams(query), spec);

/** The state with each filter's values in order, as their order doesn't change the rows. */
const sortedValues = (state: TableUrlState): TableUrlState => ({
	...state,
	columnFilters: state.columnFilters.map((filter) =>
		Array.isArray(filter.value)
			? { ...filter, value: (filter.value as string[]).toSorted() }
			: filter,
	),
});

/** The table's columns: which of its hideable ones it shows, and shows by default. */
export interface TableColumns {
	current: ColumnVisibility;
	defaults: ColumnVisibility;
}

/**
 * The views that show the table's current state (wherever it's scrolled to) and columns, compared
 * as the table reads them: `?status=quote,paid` matches `?status=paid,quote&row=30`, a saved view with
 * parameters the table no longer knows still matches what it shows, and so does one saved before
 * views had columns, whatever the columns.
 */
export function matchingViews<View extends { query: string; columns?: ColumnVisibility | null }>(
	views: readonly View[],
	state: TableUrlState,
	spec: TableUrlSpec,
	columns?: TableColumns,
): View[] {
	const key = (state: TableUrlState) => viewQuery(sortedValues(state), spec);
	const current = key(state);
	return views.filter(
		(view) =>
			key(viewState(view.query, spec)) === current &&
			(!columns ||
				!view.columns ||
				sameVisibility(withSaved(columns.defaults, view.columns), columns.current)),
	);
}
