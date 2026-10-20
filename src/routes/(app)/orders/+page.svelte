<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { listQueries } from "#lib/components/data-table/server-table.svelte.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { OrdersTable } from "#lib/orders/components.ts";
	import { ordersList } from "#lib/orders/index.ts";
	import { getOrderFacets, getOrders } from "#lib/orders/remotes.ts";

	// The server filters, sorts and pages the orders, as the URL says: a change to the URL (which
	// the table keeps in sync with itself) fetches the rows again, and the counts in the filters if
	// it isn't just the sorting. The table loads the pages after the first as it's scrolled.
	const orders = listQueries(() => ordersList, getOrders, getOrderFacets);
</script>

<PageHeader title={m.orders_title()} description={m.orders_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/orders/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.orders_new()}
		</Button>
	{/snippet}
</PageHeader>

<OrdersTable orders={await orders.rows} facets={await orders.facets} />
