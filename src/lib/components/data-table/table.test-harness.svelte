<!--
	@component
	A data table over a few work items, wired up like the app's tables, for `table.svelte.spec.ts`
	(and the other data table specs). Its rows can be grouped by status, and a group shows the sum
	of its amounts.
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

	import { formatCents } from "#lib/format.js";

	import FacetedFilter from "./faceted-filter.svelte";
	import RowActions from "./row-actions.svelte";
	import { createAppColumnHelper, createAppTable } from "./table.svelte.js";
	import TwoLineCell from "./two-line-cell.svelte";

	let {
		items,
		columnPinning,
		links = false,
	}: {
		items: Item[];
		/** Instead of the default pinning (the selection and name columns, and the actions). */
		columnPinning?: ColumnPinningState;
		/** Links each item's name to its page, `/items/<id>`, as the app's tables do. */
		links?: boolean;
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
			cell: ({ row }) =>
				links
					? renderComponent(TwoLineCell, {
							primary: row.original.name,
							href: `/items/${row.original.id}`,
						})
					: row.original.name,
			enableHiding: false,
			meta: { label: "Name" },
		}),
		column.accessor("status", {
			header: ({ header }) => renderComponent(header.ColumnHeader),
			filterFn: "oneOf",
			enableSorting: false,
			enableGrouping: true,
			meta: { label: "Status", filterValues: ["draft", "open", "closed"] },
		}),
		column.accessor("amount", {
			header: ({ header }) => renderComponent(header.ColumnHeader),
			cell: ({ cell }) => renderComponent(cell.CurrencyCell),
			enableGlobalFilter: false,
			meta: { label: "Amount", align: "end", groupSum: (sum) => formatCents(sum) },
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
