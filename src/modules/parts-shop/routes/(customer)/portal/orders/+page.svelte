<!--
	The customer's shop orders in the customer portal, newest first: each with its status and the
	Parts Credit it took, as a list of rows.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";

	import AppBar from "#lib/client/app-bar.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";
	import { getClientShopOrders } from "#modules/parts-shop/client/client-shop.remote.ts";
	import { shopOrderStatusDisplay } from "#modules/parts-shop/display.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(customer)/(modules)/parts-shop/portal/orders"> } =
		$props();

	const orders = $derived(await getClientShopOrders());
</script>

<AppBar
	title={m.shop_client_orders_title()}
	back={{ href: resolve("/(customer)/(modules)/parts-shop/portal"), label: m.shop_portal_title() }}
/>

{#if orders.length}
	<ul class="divide-y overflow-hidden rounded-xl border bg-card">
		{#each orders as order (order.id)}
			<li>
				<a
					href={resolve("/(customer)/(modules)/parts-shop/portal/orders/[number]", {
						number: order.number,
					})}
					class="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted"
					data-client-shop-order={order.number}
				>
					<span class="flex min-w-0 flex-1 flex-col gap-0.5">
						<span class="text-[0.9375rem] font-semibold">{order.number}</span>
						<span class="text-[0.8125rem] text-muted-foreground">
							{formatDate(order.createdAt)}
						</span>
					</span>
					<span class="flex shrink-0 flex-col items-end gap-1">
						<EnumBadge
							display={shopOrderStatusDisplay}
							value={order.status}
							data-shop-status={order.status}
						/>
						<span class="text-[0.9375rem] tabular-nums">{formatCents(order.total)}</span>
					</span>
					<ChevronRightIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<Empty.Root class="rounded-xl border bg-card">
		<Empty.Header>
			<Empty.Media variant="icon"><ShoppingCartIcon /></Empty.Media>
			<Empty.Title>{m.shop_client_orders_none()}</Empty.Title>
			<Empty.Description>{m.shop_client_orders_none_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
