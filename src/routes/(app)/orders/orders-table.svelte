<script lang="ts">
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import RecordFilter from "#lib/components/data-table/record-filter.svelte";
	import { serverTableLoading } from "#lib/components/data-table/server-table.svelte.js";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { priorityOptions, statusOptions, typeOptions } from "#lib/components/orders/display.js";

	import {
		getCustomerOptions,
		getEngineerOptions,
		getEquipmentOptions,
	} from "../filter-options.remote.js";
	import { columns, type OrderRow } from "./columns.js";
	import { ordersUrl } from "./orders-url.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		orders,
		facets,
	}: {
		/** A page of orders, as the URL says, and how many match in all. */
		orders: { rows: OrderRow[]; rowCount: number; key: string };
		/** How many orders have each value of the filters'. */
		facets: Record<"type" | "status" | "priority", Record<string, number>>;
	} = $props();

	const table = createAppTable({
		columns,
		serverSide: true,
		get data() {
			return orders.rows;
		},
		get rowCount() {
			return orders.rowCount;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "createdAt", desc: true }],
			columnVisibility: { createdAt: false },
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});

	// Until the rows for a new search, filter, sort or page are in.
	const loading = serverTableLoading(table, ordersUrl, () => orders.key);
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<table.Toolbar searchLabel={m.orders_search()}>
			<FacetedFilter
				columnId="status"
				title={m.orders_column_status()}
				options={statusOptions}
				counts={facets.status}
			/>
			<FacetedFilter
				columnId="type"
				title={m.orders_column_type()}
				options={typeOptions}
				counts={facets.type}
			/>
			<FacetedFilter
				columnId="priority"
				title={m.orders_column_priority()}
				options={priorityOptions}
				counts={facets.priority}
			/>
			<RecordFilter
				columnId="customer"
				title={m.orders_column_customer()}
				searchLabel={m.common_table_search_customers()}
				load={getCustomerOptions}
			/>
			<RecordFilter
				columnId="engineer"
				title={m.orders_column_engineer()}
				searchLabel={m.common_table_search_engineers()}
				load={getEngineerOptions}
			/>
			<RecordFilter
				columnId="equipment"
				title={m.orders_column_equipment()}
				searchLabel={m.common_table_search_equipment()}
				load={getEquipmentOptions}
			/>
		</table.Toolbar>
		<table.Table emptyTitle={m.orders_empty()} fillViewport loading={loading.current} />
		<table.Pagination />
	</div>
</table.AppTable>
