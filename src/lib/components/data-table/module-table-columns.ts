/**
 * The table's side of the columns modules add to a server-side list (see `module-columns.ts`):
 * TanStack columns that show each row's value with the module's cell, sort and filter like the
 * list's own (so the table writes them to the URL as the merged list reads them), and go before the
 * row actions.
 */
import { renderComponent, type RowData } from "@tanstack/svelte-table";

import { listColumnOptions } from "./list-definition.ts";
import type { ModuleListColumn, WithModuleValues } from "./module-columns.ts";
import { createAppColumnHelper } from "./table.svelte.ts";
import { noneToken } from "./url-state.ts";

/** The table columns for the modules' `columns`, for rows that carry their values. */
function moduleTableColumns<TData extends RowData & WithModuleValues>(
	columns: readonly ModuleListColumn[],
) {
	const column = createAppColumnHelper<TData>();
	return columns.map((module) => {
		const options = listColumnOptions(module);
		return column.accessor((row) => row.moduleValues[module.id] ?? null, {
			id: module.id,
			cell: ({ getValue }) => renderComponent(module.cell, { value: getValue() }),
			enableGlobalFilter: false,
			...options,
			meta: {
				label: module.label,
				...options.meta,
				// The filter's options, named as the module says (read when shown).
				...(module.filter?.values
					? {
							filterOptions: module.filter.values
								// `none` is the filter's own option where it takes it (`orNone()`).
								.filter((value) => !(module.filter?.none && value === noneToken))
								.map((value) => ({
									value,
									get label() {
										return module.optionLabel?.(value) ?? value;
									},
								})),
						}
					: {}),
				...(module.align ? { align: module.align } : {}),
			},
		});
	});
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
