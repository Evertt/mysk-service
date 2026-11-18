<!--
	One of the customer's shop orders in the customer portal: its status, its lines at the prices
	then (excluding VAT) and the Parts Credit it took; right after checking out, the confirmation
	("Bestelling SH-2026-012 is geplaatst", the credit reserved).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";

	import AppBar from "#lib/client/app-bar.svelte";
	import Callout from "#lib/components/callout.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatCents, formatDateTime, formatNumber } from "#lib/i18n/index.ts";
	import { getClientShopOrder } from "#modules/parts-shop/client/client-shop.remote.ts";
	import { shopOrderStatusDisplay } from "#modules/parts-shop/display.ts";
	import { lineAmount } from "#modules/parts-shop/model.ts";

	let {
		params,
	}: { params: RouteParams<"/(customer)/(modules)/parts-shop/portal/orders/[number]"> } = $props();

	const order = $derived(await getClientShopOrder(params.number));
	const placed = $derived(page.url.searchParams.has("placed") && order.status === "placed");
</script>

<AppBar
	title={order.number}
	subtitle={m.shop_portal_title()}
	back={{
		href: resolve("/(customer)/(modules)/parts-shop/portal/orders"),
		label: m.shop_client_orders_title(),
	}}
/>

{#if placed}
	<Callout
		tone="success"
		icon={CircleCheckIcon}
		title={m.shop_placed_title({ number: order.number })}
		role="status"
		data-order-placed
	>
		<p class="text-muted-foreground">
			{m.shop_placed_credit({ total: formatCents(order.total) })}
		</p>
	</Callout>
{/if}

<div class="flex flex-col items-start gap-2 px-1">
	<div class="flex flex-col gap-1">
		<p class="text-[0.9375rem] text-muted-foreground">
			{m.shop_client_order_placed({
				date: formatDateTime(order.createdAt),
				name: order.placedBy ?? m.shop_someone(),
			})}
		</p>
	</div>
	<EnumBadge
		display={shopOrderStatusDisplay}
		value={order.status}
		data-shop-status={order.status}
	/>
</div>

<Card.Root class="rounded-xl" data-client-order-lines>
	<Card.Content class="flex flex-col gap-3">
		<ul class="flex flex-col divide-y text-[0.9375rem]">
			{#each order.lines as line (line.id)}
				<li class="flex items-center justify-between gap-3 py-3" data-shop-line={line.sku}>
					<span class="flex min-w-0 flex-col">
						<span class="truncate font-medium">{line.name}</span>
						<span class="text-[0.8125rem] text-muted-foreground tabular-nums">
							{line.sku} · {formatNumber(line.quantity)} × {formatCents(line.unitPrice)}
						</span>
					</span>
					<span class="shrink-0 tabular-nums">
						{formatCents(lineAmount(line.quantity, line.unitPrice))}
					</span>
				</li>
			{/each}
		</ul>
		<div class="flex justify-between gap-2 border-t pt-3 font-semibold">
			<span>{m.shop_paid_with_credit()}</span>
			<span class="tabular-nums" data-shop-total>{formatCents(order.total)}</span>
		</div>
		<p class="text-[0.8125rem] text-muted-foreground">{m.shop_checkout_vat()}</p>
	</Card.Content>
</Card.Root>
