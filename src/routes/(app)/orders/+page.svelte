<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { toListQuery, whereOf } from "#lib/components/data-table/list-definition.js";
	import { parseTableUrl } from "#lib/components/data-table/url-state.js";
	import PageHeader from "#lib/components/page-header.svelte";

	import { getOrderFacets, getOrders } from "./order-list.remote.js";
	import { ordersList } from "./orders-list.js";
	import OrdersTable from "./orders-table.svelte";

	// The server pages, filters and sorts the orders, as the URL says: a change to the URL (which
	// the table keeps in sync with itself) fetches the rows again, and the counts in the filters if
	// it isn't just the page or the sorting.
	const query = $derived(
		toListQuery(ordersList, parseTableUrl(page.url.searchParams, ordersList.urlSpec)),
	);
	// Both start at once.
	const orders = $derived(getOrders(query));
	const facets = $derived(getOrderFacets(whereOf(query)));
</script>

<svelte:head>
	<title>{m.orders_title()}</title>
</svelte:head>

<PageHeader title={m.orders_title()} description={m.orders_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/orders/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.orders_new()}
		</Button>
	{/snippet}
</PageHeader>

<OrdersTable orders={await orders} facets={await facets} />
