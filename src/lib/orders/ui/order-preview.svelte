<!--
	@component
	An order's hover card (`OrderLink`): its number, status, type and priority, the first line of its
	description, its customer, site, planned moment, engineer and how many units, as `getOrder`
	answered them (which the order's page shares).
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import { formatDateTime, formatNumber } from "#lib/i18n/index.ts";

	import type { getOrder } from "../order.remote.ts";
	import PriorityBadge from "./priority-badge.svelte";
	import StatusBadge from "./status-badge.svelte";
	import TypeLabel from "./type-label.svelte";

	let { order, sites }: Pick<Awaited<ReturnType<typeof getOrder>>, "order" | "sites"> = $props();

	const firstLine = $derived(order.description.split("\n").find((line) => line.trim()) ?? "");
	// Where the work is: each site and its town, unless the site is named after it.
	const where = $derived(
		sites
			.map((site) => (site.name.includes(site.city) ? site.name : `${site.name}, ${site.city}`))
			.join(" · "),
	);
</script>

<div class="flex flex-col gap-3" data-order-preview={order.number}>
	<div class="flex flex-col gap-1">
		<div class="flex items-center justify-between gap-2">
			<span class="font-medium">{order.number}</span>
			<StatusBadge status={order.status} />
		</div>
		{#if firstLine}
			<p class="line-clamp-2 text-muted-foreground">{firstLine}</p>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			<TypeLabel type={order.type} />
			<PriorityBadge priority={order.priority} />
		</div>
	</div>
	<dl class="grid grid-cols-2 gap-3">
		<DetailItem label={m.orders_column_customer()} value={order.customer.name} />
		<DetailItem label={m.orders_site()} value={where} />
		<DetailItem
			label={m.orders_column_scheduled()}
			value={order.scheduledFor && formatDateTime(order.scheduledFor)}
		/>
		<DetailItem
			label={m.orders_column_engineer()}
			value={order.engineer?.name ?? m.common_unassigned()}
		/>
		<DetailItem label={m.orders_field_units()} value={formatNumber(order.units.length)} />
	</dl>
</div>
