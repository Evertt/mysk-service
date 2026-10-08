<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";

	import OrdersTable from "./orders-table.svelte";
	import { getOrders } from "./orders.remote.js";
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

<OrdersTable orders={await getOrders()} customer={page.url.searchParams.get("customer")} />
