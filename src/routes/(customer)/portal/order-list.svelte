<!--
	@component
	A list of the customer's orders in the portal, as a phone app's: one card of full-width rows
	(`order-card.svelte`), each a link to its order.
-->
<script lang="ts">
	import type { ComponentProps } from "svelte";

	import OrderCard from "./order-card.svelte";

	let {
		orders,
	}: {
		orders: (ComponentProps<typeof OrderCard>["order"] & { id: number })[];
	} = $props();
</script>

<ul class="divide-y overflow-hidden rounded-xl border bg-card" data-order-list>
	{#each orders as order (order.id)}
		<li><OrderCard {order} /></li>
	{/each}
</ul>
