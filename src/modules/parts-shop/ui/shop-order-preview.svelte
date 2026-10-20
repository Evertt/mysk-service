<!--
	@component
	A shop order's hover card (`ShopOrderLink`): its number and status, its customer, when it was
	placed and by whom, how many products and its total, as `getShopOrder` answered them (which the
	order's page shares).
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatCents, formatDateTime, formatNumber } from "#lib/i18n/index.ts";

	import { shopOrderStatusDisplay } from "../display.ts";
	import type { getShopOrder } from "../orders.remote.ts";

	let { order }: { order: Awaited<ReturnType<typeof getShopOrder>> } = $props();
</script>

<div class="flex flex-col gap-3" data-shop-order-preview={order.number}>
	<div class="flex items-center justify-between gap-2">
		<span class="font-medium">{order.number}</span>
		<EnumBadge display={shopOrderStatusDisplay} value={order.status} />
	</div>
	<dl class="grid grid-cols-2 gap-3">
		<DetailItem label={m.shop_column_customer()} value={order.customer.name} />
		<DetailItem label={m.shop_field_placed_by()} value={order.placedBy} />
		<DetailItem label={m.shop_column_placed()} value={formatDateTime(order.createdAt)} />
		<DetailItem label={m.shop_order_lines()} value={formatNumber(order.lines.length)} />
		<DetailItem label={m.shop_field_total()} value={formatCents(order.total)} />
	</dl>
</div>
