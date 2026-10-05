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
	import { renderComponent } from "@tanstack/svelte-table";

	import FacetedFilter from "./faceted-filter.svelte";
	import { createAppColumnHelper, createAppTable } from "./table.svelte.js";

	let { items }: { items: Item[] } = $props();

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
			meta: { label: "Status" },
		}),
		column.accessor("amount", {
			header: ({ header }) => renderComponent(header.ColumnHeader),
			cell: ({ cell }) => renderComponent(cell.CurrencyCell),
			enableGlobalFilter: false,
			meta: { label: "Amount", align: "end" },
		}),
		column.accessor("quantity", {
			header: ({ header }) => renderComponent(header.ColumnHeader),
			cell: ({ cell }) => renderComponent(cell.NumberCell, { unit: "unit" }),
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
	]);

	const table = createAppTable({
		columns,
		get data() {
			return items;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "name", desc: false }],
			pagination: { pageIndex: 0, pageSize: 5 },
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
