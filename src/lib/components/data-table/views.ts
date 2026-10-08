/**
 * Saved views: a table's search, filters, sorting and page size (its URL parameters, see
 * `url-state.ts`, without the page) saved under a name, to get back to in one click. They're
 * stored as the query string the table writes, so they work for any table that keeps its state in
 * the URL, and are read back through the table's own grammar: a parameter the table no longer
 * knows is ignored, like in a link.
 */
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

/** The state on its first page (the default page), as views don't keep the page. */
function firstPage(state: TableUrlState, spec: TableUrlSpec): TableUrlState {
	const pageIndex = spec.defaults?.pagination?.pageIndex ?? 0;
	return { ...state, pagination: { ...state.pagination, pageIndex } };
}

/** What a view saves of a table's state: its parameters but the page, e.g. `?status=quote`. */
export const viewQuery = (state: TableUrlState, spec: TableUrlSpec) =>
	tableUrlKey(firstPage(state, spec), spec);

/** The table's state a saved query stands for, on the first page. */
export const viewState = (query: string, spec: TableUrlSpec) =>
	firstPage(parseTableUrl(new URLSearchParams(query), spec), spec);

/** The state with each filter's values in order, as their order doesn't change the rows. */
const sortedValues = (state: TableUrlState): TableUrlState => ({
	...state,
	columnFilters: state.columnFilters.map((filter) =>
		Array.isArray(filter.value)
			? { ...filter, value: (filter.value as string[]).toSorted() }
			: filter,
	),
});

/**
 * The views that show the table's current state (whatever its page), compared as the table reads
 * them: `?status=quote,paid` matches `?status=paid,quote&page=3`, and a saved view with parameters
 * the table no longer knows still matches what it shows.
 */
export function matchingViews<View extends { query: string }>(
	views: readonly View[],
	state: TableUrlState,
	spec: TableUrlSpec,
): View[] {
	const key = (state: TableUrlState) => viewQuery(sortedValues(state), spec);
	const current = key(state);
	return views.filter((view) => key(viewState(view.query, spec)) === current);
}
