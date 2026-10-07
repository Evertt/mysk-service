<script lang="ts">
	import { resolve } from "$app/paths";
	import XIcon from "@lucide/svelte/icons/x";

	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { priorityOptions, statusOptions, typeOptions } from "#lib/components/orders/display.js";

	import { columns, type OrderRow } from "./columns.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		orders,
		customer = null,
	}: {
		orders: OrderRow[];
		/** Only this customer's orders (by code), e.g. from the page's `?customer=`. */
		customer?: string | null;
	} = $props();

	const shown = $derived(
		customer ? orders.filter((row) => row.customer.code === customer) : orders,
	);
	const customerName = $derived(
		orders.find((row) => row.customer.code === customer)?.customer.name ?? customer,
	);

	const table = createAppTable({
		columns,
		get data() {
			return shown;
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
			{#if customer}
				<Button
					variant="secondary"
					size="sm"
					href={resolve("/(app)/orders")}
					title="Show all orders"
				>
					Customer: {customerName}
					<XIcon data-icon="inline-end" />
				</Button>
			{/if}
			<FacetedFilter columnId="status" title="Status" options={statusOptions} />
			<FacetedFilter columnId="type" title="Type" options={typeOptions} />
			<FacetedFilter columnId="priority" title="Priority" options={priorityOptions} />
		</table.Toolbar>
		<table.Table emptyTitle="No orders found" />
		<table.Pagination />
	</div>
</table.AppTable>
