<!--
	@component
	One of the customer's orders in the portal's lists: a link to it, with what it's about, its
	units and where it stands; a rejected report shows why.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	import { unitTitle } from "#lib/equipment/index.ts";
	import { formatDate, formatNumber, label } from "#lib/i18n/index.ts";
	import type { OrderPriority, OrderStatus, OrderType } from "#lib/models.ts";

	import ClientStatusBadge from "./client-status-badge.svelte";

	let {
		order,
	}: {
		order: {
			number: string;
			type: OrderType;
			status: OrderStatus;
			priority: OrderPriority;
			description: string;
			createdAt: Temporal.Instant;
			scheduledFor: Temporal.Instant | null;
			completedAt: Temporal.Instant | null;
			rejectionReason: string | null;
			/** Who reported it in the portal, if it was reported there. */
			reportedBy: string | null;
			units: { name: string | null; manufacturer: string; model: string }[];
		};
	} = $props();

	const when = $derived(
		order.completedAt
			? m.client_completed_on({ date: formatDate(order.completedAt) })
			: order.scheduledFor && order.status !== "cancelled"
				? m.client_planned_on({ date: formatDate(order.scheduledFor) })
				: order.reportedBy
					? m.client_reported_on({ date: formatDate(order.createdAt) })
					: m.client_created_on({ date: formatDate(order.createdAt) }),
	);
	const units = $derived(
		order.units.length
			? order.units.length > 1
				? m.client_units_more({
						unit: unitTitle(order.units[0]),
						more: formatNumber(order.units.length - 1),
					})
				: unitTitle(order.units[0])
			: null,
	);
</script>

<a
	href={resolve("/(customer)/portal/orders/[number]", { number: order.number })}
	data-order={order.number}
	class="flex items-center gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:bg-accent active:bg-accent"
>
	<div class="flex min-w-0 flex-1 flex-col gap-2">
		<div class="flex items-center justify-between gap-2">
			<span class="truncate font-medium">
				{label("orderType", order.type)}{units ? ` · ${units}` : ""}
			</span>
			<span class="shrink-0 text-xs text-muted-foreground tabular-nums">{order.number}</span>
		</div>
		<p class="line-clamp-2 text-sm">{order.description}</p>
		{#if order.rejectionReason}
			<p class="text-sm text-destructive">
				{m.client_rejected_because({ reason: order.rejectionReason })}
			</p>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			<ClientStatusBadge status={order.status} rejectionReason={order.rejectionReason} />
			<span class="text-xs text-muted-foreground">{when}</span>
		</div>
	</div>
	<ChevronRightIcon class="size-5 shrink-0 text-muted-foreground" />
</a>
