<script lang="ts">
	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { whereOf } from "#lib/components/data-table/list-definition.js";
	import RecordFilter from "#lib/components/data-table/record-filter.svelte";
	import { serverTableLoading } from "#lib/components/data-table/server-table.svelte.js";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { priorityOptions, statusOptions, typeOptions } from "#lib/components/orders/display.js";

	import {
		getCustomerOptions,
		getEngineerOptions,
		getEquipmentOptions,
	} from "../filter-options.remote.js";
	import { moduleBulkActions } from "../module-bulk-actions.svelte.js";
	import { assignEngineer, changeStatus, deleteOrders } from "./bulk-actions.js";
	import { columns } from "./columns.js";
	import type { getOrderFacets, getOrders } from "./order-list.remote.js";
	import { ordersList } from "./orders-list.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		orders,
		facets,
	}: {
		/** A page of orders, as the URL says, how many match in all, and its groups when grouped. */
		orders: Awaited<ReturnType<typeof getOrders>>;
		/** How many orders have each value of the filters'. */
		facets: Awaited<ReturnType<typeof getOrderFacets>>;
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
		// Newest first, 20 per page: the defaults the server has too.
		initialState: { ...ordersList.urlSpec.defaults, columnVisibility: { createdAt: false } },
	});

	// Until the rows for a new search, filter, sort or page are in.
	const loading = serverTableLoading(table, ordersList, () => orders.key);

	// The tenant's modules add theirs (e.g. "Create invoice") before the delete.
	const moduleActions = moduleBulkActions("orders");
	const actions = $derived([assignEngineer, changeStatus, ...moduleActions.current, deleteOrders]);
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
		<table.Table
			emptyTitle={m.orders_empty()}
			fillViewport
			loading={loading.current}
			groups={orders.groups}
		/>
		<BulkActionBar
			{actions}
			matching={{ where: whereOf(orders.query), key: orders.key, count: orders.rowCount }}
		/>
		<table.Pagination />
	</div>
</table.AppTable>
