<script lang="ts">
	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import {
		getCustomerOptions,
		getEngineerOptions,
		getEquipmentOptions,
	} from "#lib/components/data-table/filter-options.remote.ts";
	import { whereOf } from "#lib/components/data-table/list-definition.ts";
	import RecordFilter from "#lib/components/data-table/record-filter.svelte";
	import { serverTableLoading } from "#lib/components/data-table/server-table.svelte.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
	import { extensionBulkActions } from "#lib/extensions/bulk-actions.svelte.ts";
	import { priorityOptions, statusOptions, typeOptions } from "#lib/orders";
	import { list as bulkTable } from "#lib/orders/extensions.ts";

	import { assignEngineer, changeStatus, deleteOrders } from "./bulk-actions.ts";
	import { columns } from "./columns.ts";
	import type { getOrderFacets, getOrders } from "./order-list.remote.ts";
	import { ordersList } from "./orders-list.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		orders,
		facets,
	}: {
		/** A page of orders, as the URL says, how many match in all, and its groups when grouped. */
		orders: Awaited<ReturnType<typeof getOrders>>;
		/**
		 * How many orders have each value of the filters' (the unassigned orders and the new
		 * installations under `none`).
		 */
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
	const moduleActions = extensionBulkActions(bulkTable);
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
				none={m.common_unassigned()}
				counts={facets.engineer}
			/>
			<RecordFilter
				columnId="equipment"
				title={m.orders_column_equipment()}
				searchLabel={m.common_table_search_equipment()}
				load={getEquipmentOptions}
				none={m.orders_new_installation()}
				counts={facets.equipment}
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
