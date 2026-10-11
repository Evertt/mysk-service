/**
 * The table's side of the columns modules add to a server-side list (see `module-columns.ts`):
 * TanStack columns that show each row's value with the module's cell, sort and filter like the
 * list's own (so the table writes them to the URL as the merged list reads them), and go before the
 * row actions.
 */
import { renderComponent, type RowData } from "@tanstack/svelte-table";

import type { ModuleListColumn, WithModuleValues } from "./module-columns.ts";
import { createAppColumnHelper } from "./table.svelte.ts";

/** The table columns for the modules' `columns`, for rows that carry their values. */
function moduleTableColumns<TData extends RowData & WithModuleValues>(
	columns: readonly ModuleListColumn[],
) {
	const column = createAppColumnHelper<TData>();
	return columns.map((module) =>
		column.accessor((row) => row.moduleValues[module.id] ?? null, {
			id: module.id,
			cell: ({ getValue }) => renderComponent(module.cell, { value: getValue() }),
			enableSorting: Boolean(module.sort),
			enableGlobalFilter: false,
			...(module.filter ? { filterFn: "oneOf" as const } : {}),
			meta: {
				label: module.label,
				param: module.param,
				...(module.filter?.values ? { filterValues: module.filter.values } : {}),
				...(module.align ? { align: module.align } : {}),
			},
		}),
	);
}

/**
 * The table's `columns` with the modules' (`moduleTableColumns()`) before its `actions` column,
 * or at the end if it has none.
 */
export function withModuleTableColumns<TData extends RowData & WithModuleValues, Column>(
	columns: readonly Column[],
	modules: readonly ModuleListColumn[],
): Column[] {
	if (!modules.length) return [...columns];
	const added = moduleTableColumns<TData>(modules) as unknown as Column[];
	const actions = columns.findIndex((column) => (column as { id?: string }).id === "actions");
	const at = actions === -1 ? columns.length : actions;
	return [...columns.slice(0, at), ...added, ...columns.slice(at)];
}
