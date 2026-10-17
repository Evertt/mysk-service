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

	import { formatCents, formatDateTime, formatNumber } from "#lib/i18n/index.ts";
	import { getClientShopOrder } from "#modules/parts-shop/client/client-shop.remote.ts";
	import { lineAmount } from "#modules/parts-shop/model.ts";
	import StatusBadge from "#modules/parts-shop/ui/status-badge.svelte";

	let {
		params,
	}: { params: RouteParams<"/(customer)/(modules)/parts-shop/portal/orders/[number]"> } = $props();

	const order = $derived(await getClientShopOrder(params.number));
	const placed = $derived(page.url.searchParams.has("placed") && order.status === "placed");
</script>

<svelte:head>
	<title>{order.number}</title>
</svelte:head>

{#if placed}
	<div
		class="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4"
		role="status"
		data-order-placed
	>
		<CircleCheckIcon class="mt-0.5 size-5 shrink-0 text-emerald-600" />
		<div class="flex flex-col gap-0.5">
			<span class="font-medium">{m.shop_placed_title({ number: order.number })}</span>
			<span class="text-sm text-muted-foreground">
				{m.shop_placed_credit({ total: formatCents(order.total) })}
			</span>
		</div>
	</div>
{/if}

<div class="flex flex-wrap items-center justify-between gap-3">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold tracking-tight">{order.number}</h1>
		<p class="text-sm text-muted-foreground">
			{m.shop_client_order_placed({
				date: formatDateTime(order.createdAt),
				name: order.placedBy ?? m.shop_someone(),
			})}
		</p>
	</div>
	<StatusBadge status={order.status} />
</div>

<Card.Root class="w-full max-w-3xl" data-client-order-lines>
	<Card.Content class="flex flex-col gap-3">
		<ul class="flex flex-col divide-y text-sm">
			{#each order.lines as line (line.id)}
				<li class="flex items-center justify-between gap-3 py-2" data-shop-line={line.sku}>
					<span class="flex min-w-0 flex-col">
						<span class="truncate font-medium">{line.name}</span>
						<span class="text-xs text-muted-foreground tabular-nums">
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
		<p class="text-xs text-muted-foreground">{m.shop_checkout_vat()}</p>
	</Card.Content>
</Card.Root>

<Button
	variant="outline"
	class="self-start"
	href={resolve("/(customer)/(modules)/parts-shop/portal/orders")}
>
	{m.shop_client_orders_title()}
</Button>
