<!--
	@component
	A customer's hover card (`CustomerLink`): their name, code and town, phone and email, how many
	open orders and units they have, and when they last ordered, as `getCustomer` answered them
	(which the customer's page shares).
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import { formatDate, formatNumber } from "#lib/i18n/index.ts";

	import type { getCustomer } from "../customers.remote.ts";

	let { customer, stats }: Awaited<ReturnType<typeof getCustomer>> = $props();
</script>

<div class="flex flex-col gap-3" data-customer-preview={customer.code}>
	<div class="flex flex-col gap-0.5">
		<span class="font-medium">{customer.name}</span>
		<span class="text-muted-foreground">{customer.code} · {customer.city}</span>
	</div>
	<!-- An email address has the card's width. -->
	<dl class="grid gap-3">
		<DetailItem label={m.customers_card_phone()} value={customer.phone} />
		<DetailItem label={m.customers_card_email()} value={customer.email} />
	</dl>
	<dl class="grid grid-cols-2 gap-3">
		<DetailItem label={m.customers_column_open_orders()} value={formatNumber(stats.openOrders)} />
		<DetailItem
			label={m.customers_column_equipment()}
			value={formatNumber(customer.equipment.length)}
		/>
	</dl>
	<p class="text-xs text-muted-foreground">
		{stats.lastOrderAt
			? m.customers_stats_last_order({ date: formatDate(stats.lastOrderAt) })
			: m.customers_stats_no_orders()}
	</p>
</div>
