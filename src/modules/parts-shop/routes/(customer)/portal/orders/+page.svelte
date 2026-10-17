<!--
	The customer's shop orders in the customer portal, newest first: each with its status and the
	Parts Credit it took; cards on a phone, a table's rows on a wide screen.
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

{#if orders.length}
	<!-- Cards on a phone, rows of a table on a wide screen. -->
	<div class="@container">
		<div
			class="flex flex-col gap-3 @2xl:gap-0 @2xl:divide-y @2xl:overflow-hidden @2xl:rounded-xl @2xl:border @2xl:bg-card"
		>
			{#each orders as order (order.id)}
				<a
					href={resolve("/(customer)/(modules)/parts-shop/portal/orders/[number]", {
						number: order.number,
					})}
					class="flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-accent @2xl:grid @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_8rem] @2xl:justify-items-start @2xl:rounded-none @2xl:border-0 @2xl:px-4 @2xl:py-3"
					data-client-shop-order={order.number}
				>
					<span class="flex min-w-0 flex-col @2xl:contents">
						<span class="font-medium">{order.number}</span>
						<span class="text-xs text-muted-foreground @2xl:text-sm">
							{formatDate(order.createdAt)}
						</span>
					</span>
					<span class="flex shrink-0 flex-col items-end gap-1 @2xl:contents">
						<StatusBadge status={order.status} />
						<span class="text-sm tabular-nums @2xl:justify-self-end">
							{formatCents(order.total)}
						</span>
					</span>
				</a>
			{/each}
		</div>
	</div>
{:else}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Media variant="icon"><ShoppingCartIcon /></Empty.Media>
			<Empty.Title>{m.shop_client_orders_none()}</Empty.Title>
			<Empty.Description>{m.shop_client_orders_none_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
