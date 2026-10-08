<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { serverTableQuery } from "#lib/components/data-table/server-table.svelte.js";
	import PageHeader from "#lib/components/page-header.svelte";

	import OrdersTable from "./orders-table.svelte";
	import { ordersUrl } from "./orders-url.js";
	import { getOrderFacets, getOrders } from "./orders.remote.js";

	// The server pages, filters and sorts the orders, as the URL says: a change to the URL (which
	// the table keeps in sync with itself) fetches the rows again, and the counts in the filters if
	// it isn't just the page or the sorting.
	const query = $derived(serverTableQuery(page.url.searchParams, ordersUrl));
	// Both start at once.
	const orders = $derived(getOrders(query.rows));
	const facets = $derived(getOrderFacets(query.facets));
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
