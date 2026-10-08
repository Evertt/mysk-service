<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";

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

	// The customers the list is narrowed to (`?customer=CUST-0001`, from a customer's page), by
	// name where they have orders.
	const customers = $derived(
		((table.getColumn("customer")?.getFilterValue() as string[] | undefined) ?? []).map(
			(code) => orders.find((row) => row.customer.code === code)?.customer.name ?? code,
		),
	);
</script>

<table.AppTable>
	<div class="flex flex-col gap-4">
		<table.Toolbar searchLabel={m.orders_search()}>
			{#if customers.length}
				<Button
					variant="secondary"
					size="sm"
					title={m.orders_show_all()}
					onclick={() => table.getColumn("customer")?.setFilterValue(undefined)}
				>
					{m.orders_customer_filter({ name: customers.join(", ") })}
					<XIcon data-icon="inline-end" />
				</Button>
			{/if}
			<FacetedFilter columnId="status" title={m.orders_column_status()} options={statusOptions} />
			<FacetedFilter columnId="type" title={m.orders_column_type()} options={typeOptions} />
			<FacetedFilter
				columnId="priority"
				title={m.orders_column_priority()}
				options={priorityOptions}
			/>
		</table.Toolbar>
		<table.Table emptyTitle={m.orders_empty()} />
		<table.Pagination />
	</div>
</table.AppTable>
