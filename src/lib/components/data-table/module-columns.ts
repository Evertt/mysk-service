/**
 * Columns that the optional modules add to a core server-side list, e.g. maintenance's "Next
 * maintenance" in the equipment list. The list names its extension point in its definition
 * (`defineList({ moduleColumns: points.list.columns })`, the record's `list.columns` point,
 * `defineRecordPoints()` in its `extensions.ts`), and a module contributes two files per list:
 *
 * - `src/modules/<id>/columns/<point id>.ts`: default export, the columns' definitions, each a
 *   `listColumn()`: its namespaced id (`maintenance.nextDue`), its name in the URL, its label,
 *   whether it sorts, its filter's kind and the cell that shows its value. Isomorphic, and loaded
 *   only for the tenants with the module (`loadListColumns()`, `#lib/extensions/list-columns.ts`).
 * - `src/modules/<id>/server/columns/<point id>.ts`: default export, their SQL, each a
 *   `columnSql(column, …)` (`#lib/server/lists/module-columns.ts`): what the column shows, sorts
 *   by, filters by and counts under in the filter, over the list's joined tables, tenant-scoped.
 *
 * The page merges the tenant's columns into the list (`extendList()` in `list-definition.ts`)
 * before it reads the URL, so a tenant without the module gets neither the column nor its URL
 * parameter, and the server merges their SQL (`withModuleColumns()`) and checks the query against
 * the tenant's list. Core's own columns keep their exact types; a module column is typed where it
 * is contributed. Grouping by a module column isn't supported (yet).
 */
import type { Component } from "svelte";

import type { FilterKind } from "./list-definition.ts";

/** A module column's id: its module's id, a dot and a name, e.g. `maintenance.nextDue`. */
type ModuleColumnId = `${string}.${string}`;

/** The shape of a module column's id. */
export const moduleColumnIdPattern = /^[a-z][a-z0-9-]*\.[A-Za-z][A-Za-z0-9]*$/;

/**
 * A column a module adds to a core list: what the list's definition and table need of it. Its
 * types are `any` by default, for the registries, which hold columns of every value and filter.
 */
export interface ModuleListColumn<Value = any, Filter = any> {
	/** Its module's id, a dot and a name: `maintenance.nextDue`. */
	id: ModuleColumnId;
	/** Its name in the URL, as a filter and in `sort`, e.g. `next-maintenance`. */
	param: string;
	/** Its header, a message function (read when shown). */
	label: () => string;
	/** Whether the list can be sorted by it. */
	sort?: boolean;
	/** The values the list can be filtered by on it, e.g. `oneOf(["overdue", "soon", "none"])`. */
	filter?: FilterKind<Filter>;
	/** How a filter value reads in the filter's options, e.g. "Overdue". */
	optionLabel?: (value: Filter) => string;
	/** Shows the row's value (`row.moduleValues[id]`), e.g. a date with a badge. */
	cell: Component<{ value: Value }>;
	/** Right-aligned, like numbers. */
	align?: "end";
}

/** Declares a module column, typed by its cell's value and its filter's values. */
export const listColumn = <Value, Filter = string>(column: ModuleListColumn<Value, Filter>) =>
	column;

/**
 * Throws when `column`, contributed by `module`, isn't named as its module's: a programming error,
 * which shows as soon as the column is merged.
 */
export function checkModuleColumn(column: ModuleListColumn, module: string) {
	if (!moduleColumnIdPattern.test(column.id) || !column.id.startsWith(`${module}.`)) {
		throw new Error(
			`The ${module} module's column "${column.id}" must be called "${module}.<name>".`,
		);
	}
}

/** A row of a list with module columns: their values, by column id. */
export interface WithModuleValues {
	moduleValues: Readonly<Record<string, unknown>>;
}
