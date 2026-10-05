import { createTableHook } from "@tanstack/svelte-table";

import ColumnHeader from "./column-header.svelte";
import CurrencyCell from "./currency-cell.svelte";
import DateCell from "./date-cell.svelte";
import { features } from "./features.js";
import Pagination from "./pagination.svelte";
import SelectAllHeader from "./select-all-header.svelte";
import SelectCell from "./select-cell.svelte";
import ViewOptions from "./view-options.svelte";

/**
 * App-wide table hook: tables created with `createAppTable` share the features, defaults and
 * the shadcn-svelte building blocks below. Those components take no props for the table, cell
 * or header; they read it from context with `useTableContext`, `useCellContext` and
 * `useHeaderContext`.
 */
export const {
	createAppColumnHelper,
	createAppTable,
	useTableContext,
	useCellContext,
	useHeaderContext,
} = createTableHook({
	features,
	globalFilterFn: "includesString",
	enableRowSelection: true,
	tableComponents: { Pagination, ViewOptions },
	cellComponents: { SelectCell, DateCell, CurrencyCell },
	headerComponents: { ColumnHeader, SelectAllHeader },
});
