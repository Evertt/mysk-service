<script lang="ts">
	import { getTenantModules } from "#lib/auth/session.remote.ts";
	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { createServerTable } from "#lib/components/data-table/server-table.svelte.ts";
	import { bulkContributions } from "#lib/extensions/contributions.gen.ts";
	import { loadContributions } from "#lib/extensions/define.ts";

	import { points } from "../extensions.ts";
	import { assignEngineer, changeStatus, deleteOrders } from "./bulk-actions.ts";
	import { columns } from "./columns.ts";
	import {
		getOrderCustomerOptions,
		getOrderEngineerOptions,
		getOrderEquipmentOptions,
		type getOrderFacets,
		getOrders,
	} from "./order-list.remote.ts";
	import { ordersList } from "./orders-list.ts";
	import { setStatusCellQuery } from "./status-cell.svelte";

	// The table is created here rather than in the page because making the table sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		orders,
		facets,
	}: {
		/**
		 * The first page of orders, as the URL says, how many match in all, and its groups when
		 * grouped: the table loads the next as it's scrolled.
		 */
		orders: Awaited<ReturnType<typeof getOrders>>;
		/** How many orders have each type, status and priority. */
		facets: Awaited<ReturnType<typeof getOrderFacets>>;
	} = $props();

	const table = createServerTable({
		list: ordersList,
		first: () => orders,
		fetch: getOrders,
		columns,
		// Newest first: the default the server has too.
		initialState: { columnVisibility: { createdAt: false } },
	});

	// The status cells change an order's status, showing it at once in the page of rows it's on.
	setStatusCellQuery((id) => table.pages.queryOf(id));

	// The tenant's modules add theirs (e.g. "Create invoice") before the delete.
	// One `await` per `$derived`: two in one leave the first's context restored while the second
	// waits, and a navigation that runs then can't set its state (state_unsafe_mutation).
	const tenantModules = $derived(await getTenantModules());
	const moduleActions = $derived(
		await loadContributions(bulkContributions, points.list.bulk, tenantModules),
	);
	const actions = $derived([
		assignEngineer,
		changeStatus,
		...moduleActions.flatMap(({ value }) => value ?? []),
		deleteOrders,
	]);
</script>

<ListLayout
	{table}
	{facets}
	{actions}
	searchLabel={m.orders_search()}
	emptyTitle={m.orders_empty()}
	filters={{
		customer: { load: getOrderCustomerOptions, searchLabel: m.common_table_search_customers() },
		engineer: { load: getOrderEngineerOptions, searchLabel: m.common_table_search_engineers() },
		equipment: { load: getOrderEquipmentOptions, searchLabel: m.common_table_search_equipment() },
		scheduledFor: {
			presets: [
				"today",
				"tomorrow",
				"this-week",
				"next-week",
				"next-7-days",
				"this-month",
				"before-today",
				"from-today",
			],
		},
		createdAt: {
			presets: [
				"today",
				"yesterday",
				"this-week",
				"last-week",
				"last-7-days",
				"last-30-days",
				"this-month",
				"last-month",
			],
		},
		total: { min: 0 },
	}}
/>
