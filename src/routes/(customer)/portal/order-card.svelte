<!--
	@component
	One of the customer's orders in the portal's lists (`order-list.svelte`): a full-width row that
	links to it, with what it's about and its units, its number, where it stands and when; a rejected
	report shows why, and how many photos it has where the list knows (a unit's service history).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { unitTitle } from "#lib/equipment/index.ts";
	import { formatDate, formatNumber, label } from "#lib/i18n/index.ts";
	import type { OrderPriority, OrderStatus, OrderType } from "#lib/models.ts";
	import { PhotoCount } from "#lib/orders/components.ts";

	import { clientStatus, clientStatusDisplay } from "./client-status.ts";

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
			photos?: readonly unknown[];
		};
	} = $props();

	const status = $derived(clientStatus(order.status, order.rejectionReason));
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
	class="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60 active:bg-muted"
>
	<span class="flex min-w-0 flex-1 flex-col gap-1.5">
		<span class="flex items-baseline justify-between gap-3">
			<span class="truncate text-[0.9375rem] font-semibold">
				{label("orderType", order.type)}{units ? ` · ${units}` : ""}
			</span>
			<span class="shrink-0 text-[0.8125rem] text-muted-foreground tabular-nums">
				{order.number}
			</span>
		</span>
		<span class="line-clamp-2 text-[0.9375rem]">{order.description}</span>
		{#if order.rejectionReason}
			<span class="text-[0.9375rem] text-destructive">
				{m.client_rejected_because({ reason: order.rejectionReason })}
			</span>
		{/if}
		<span class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<EnumBadge display={clientStatusDisplay} value={status} data-client-status={status} />
			<span class="text-[0.8125rem] text-muted-foreground">{when}</span>
			<PhotoCount count={order.photos?.length ?? 0} />
		</span>
	</span>
	<ChevronRightIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
</a>
