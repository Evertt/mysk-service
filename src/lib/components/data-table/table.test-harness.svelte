<!--
	@component
	A data table over a few work items, wired up like the app's tables, for `table.svelte.spec.ts`.
-->
<script lang="ts" module>
	export interface Item {
		id: number;
		name: string;
		status: "draft" | "open" | "closed";
		/** In cents. */
		amount: number;
		quantity: number;
		dueOn: Date | null;
	}
</script>

<script lang="ts">
	import { type ColumnPinningState, renderComponent } from "@tanstack/svelte-table";

	import FacetedFilter from "./faceted-filter.svelte";
	import RowActions from "./row-actions.svelte";
	import { createAppColumnHelper, createAppTable } from "./table.svelte.js";

	let {
		items,
		columnPinning,
	}: {
		items: Item[];
		/** Instead of the default pinning (the selection and name columns, and the actions). */
		columnPinning?: ColumnPinningState;
	} = $props();

	const statusOptions = [
		{ value: "draft", label: "Draft" },
		{ value: "open", label: "Open" },
		{ value: "closed", label: "Closed" },
	];

	const column = createAppColumnHelper<Item>();
	const columns = column.columns([
		column.display({
			id: "select",
			header: ({ header }) => renderComponent(header.SelectAllHeader),
			cell: ({ cell }) => renderComponent(cell.SelectCell),
			enableSorting: false,
			enableHiding: false,
		}),
		column.accessor("name", {
			header: ({ header }) => renderComponent(header.ColumnHeader),
			enableHiding: false,
			meta: { label: "Name" },
		}),
		column.accessor("status", {
			header: ({ header }) => renderComponent(header.ColumnHeader),
			filterFn: "oneOf",
			enableSorting: false,
			meta: { label: "Status", filterValues: ["draft", "open", "closed"] },
		}),
		column.accessor("amount", {
			header: ({ header }) => renderComponent(header.ColumnHeader),
			cell: ({ cell }) => renderComponent(cell.CurrencyCell),
			enableGlobalFilter: false,
			meta: { label: "Amount", align: "end" },
		}),
		column.accessor("quantity", {
			header: ({ header }) => renderComponent(header.ColumnHeader),
			cell: ({ cell }) => renderComponent(cell.NumberCell, { format: m.common_count_units }),
			enableGlobalFilter: false,
			meta: { label: "Quantity", align: "end" },
		}),
		column.accessor("dueOn", {
			header: ({ header }) => renderComponent(header.ColumnHeader),
			cell: ({ cell }) => renderComponent(cell.DateCell),
			enableGlobalFilter: false,
			enableSorting: false,
			enableHiding: false,
			meta: { label: "Due" },
		}),
		column.display({
			id: "actions",
			cell: ({ row }) => renderComponent(RowActions, { label: row.original.name }),
		}),
	]);

	// The initial pinning, read once.
	// svelte-ignore state_referenced_locally
	const table = createAppTable({
		columns,
		get data() {
			return items;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "name", desc: false }],
			pagination: { pageIndex: 0, pageSize: 5 },
			...(columnPinning && { columnPinning }),
		},
	});
</script>

<table.AppTable>
	<table.Toolbar searchLabel="Search items…">
		<FacetedFilter columnId="status" title="Status" options={statusOptions} />
	</table.Toolbar>
	<table.Table emptyTitle="No items found" />
	<table.Pagination pageSizes={[5, 10]} />
</table.AppTable>
