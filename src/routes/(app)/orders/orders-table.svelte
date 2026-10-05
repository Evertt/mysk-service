<script lang="ts">
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { priorityOptions, statusOptions, typeOptions } from "#lib/components/orders/display.js";

	import { columns, type OrderRow } from "./columns.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { orders }: { orders: OrderRow[] } = $props();

	const table = createAppTable({
		columns,
		get data() {
			return orders;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "createdAt", desc: true }],
			columnVisibility: { createdAt: false },
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});
</script>

<table.AppTable>
	<div class="flex flex-col gap-4">
		<table.Toolbar searchLabel="Search orders…">
			<FacetedFilter columnId="status" title="Status" options={statusOptions} />
			<FacetedFilter columnId="type" title="Type" options={typeOptions} />
			<FacetedFilter columnId="priority" title="Priority" options={priorityOptions} />
		</table.Toolbar>
		<table.Table emptyTitle="No orders found" />
		<table.Pagination />
	</div>
</table.AppTable>
