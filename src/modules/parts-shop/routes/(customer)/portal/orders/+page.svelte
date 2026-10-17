<!--
	The customer's shop orders in the customer portal, newest first: each with its status and the
	Parts Credit it took.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";

	import { formatCents, formatDate } from "#lib/i18n/index.ts";
	import { getClientShopOrders } from "#modules/parts-shop/client/client-shop.remote.ts";
	import StatusBadge from "#modules/parts-shop/ui/status-badge.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(customer)/(modules)/parts-shop/portal/orders"> } =
		$props();

	const orders = $derived(await getClientShopOrders());
</script>

<svelte:head>
	<title>{m.shop_client_orders_title()}</title>
</svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
	<h1 class="text-2xl font-semibold tracking-tight">{m.shop_client_orders_title()}</h1>
	<Button variant="outline" href={resolve("/(customer)/(modules)/parts-shop/portal")}>
		{m.shop_portal_title()}
	</Button>
</div>

{#each orders as order (order.id)}
	<a
		href={resolve("/(customer)/(modules)/parts-shop/portal/orders/[number]", {
			number: order.number,
		})}
		class="flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
		data-client-shop-order={order.number}
	>
		<span class="flex min-w-0 flex-col">
			<span class="font-medium">{order.number}</span>
			<span class="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
		</span>
		<span class="flex shrink-0 flex-col items-end gap-1">
			<StatusBadge status={order.status} />
			<span class="text-sm tabular-nums">{formatCents(order.total)}</span>
		</span>
	</a>
{:else}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Media variant="icon"><ShoppingCartIcon /></Empty.Media>
			<Empty.Title>{m.shop_client_orders_none()}</Empty.Title>
			<Empty.Description>{m.shop_client_orders_none_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/each}
