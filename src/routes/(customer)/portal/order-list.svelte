<!--
	@component
	A list of the customer's orders in the portal (`order-card.svelte`): stacked cards where it's
	narrow (a phone, a side column), a table with a row per order and its columns' heads where it's
	wide enough. It goes by its own width (a container query), not the screen's.
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

<div class="order-list">
	<div class="order-table">
		<div class="order-heads" aria-hidden="true" data-order-heads>
			<span>{m.client_column_number()}</span>
			<span>{m.client_column_order()}</span>
			<span>{m.client_column_status()}</span>
			<span>{m.client_column_when()}</span>
		</div>
		{#each orders as order (order.id)}
			<OrderCard {order} />
		{/each}
	</div>
</div>

<style>
	.order-list {
		container: order-list / inline-size;
	}
	.order-table {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.order-heads {
		display: none;
	}

	/* The same columns as a row's (`order-card.svelte`). */
	@container order-list (width >= 50rem) {
		.order-table {
			gap: 0;
			overflow: hidden;
			border: 1px solid var(--border);
			border-radius: calc(var(--radius) * 1.4);
			background: var(--card);
			box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		}
		.order-heads {
			display: grid;
			grid-template-columns: 9rem minmax(0, 1fr) 10rem 11rem 1.25rem;
			column-gap: 1rem;
			padding: 0.625rem 1rem;
			background: var(--muted);
			color: var(--muted-foreground);
			font-size: 0.75rem;
			line-height: 1rem;
			font-weight: 500;
		}
	}
</style>
