<script lang="ts">
	import OrdersTable from "./orders-table.svelte";
	import { getOrders } from "./orders.remote.js";
</script>

<svelte:head>
	<title>Orders</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold tracking-tight">Orders</h1>
	<p class="text-muted-foreground">Work orders across all customers and engineers.</p>
</div>

<OrdersTable orders={await getOrders()} />
