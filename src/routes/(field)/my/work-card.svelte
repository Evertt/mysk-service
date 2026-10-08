<!--
	@component
	One of the engineer's orders in their lists: a large link to the order, with when, where and what.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import MapPinIcon from "@lucide/svelte/icons/map-pin";

	import PriorityBadge from "#lib/components/orders/priority-badge.svelte";
	import StatusBadge from "#lib/components/orders/status-badge.svelte";
	import { formatDate } from "#lib/format.js";
	import type { OrderPriority, OrderStatus } from "#lib/models.js";

	import { plannedTime } from "./work.js";

	let {
		order,
		when,
	}: {
		order: {
			number: string;
			status: OrderStatus;
			priority: OrderPriority;
			description: string;
			customer: { name: string; city: string };
		};
		/** What to show as its time, e.g. the planned time or the completion date. */
		when: { date: Date | null; show: "time" | "date" };
	} = $props();
</script>

<a
	href={resolve("/(field)/my/[number]", { number: order.number })}
	data-order={order.number}
	class="flex items-center gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:bg-accent active:bg-accent"
>
	<div class="flex min-w-0 flex-1 flex-col gap-2">
		<div class="flex items-center justify-between gap-2">
			<span class="text-base font-semibold tabular-nums">
				{#if when.date}
					{when.show === "time" ? plannedTime(when.date) : formatDate(when.date)}
				{:else}
					{m.portal_no_time()}
				{/if}
			</span>
			<span class="text-xs text-muted-foreground tabular-nums">{order.number}</span>
		</div>
		<div class="flex flex-col gap-0.5">
			<span class="truncate font-medium">{order.customer.name}</span>
			<span class="flex items-center gap-1 text-sm text-muted-foreground">
				<MapPinIcon class="size-3.5 shrink-0" />
				<span class="truncate">{order.customer.city}</span>
			</span>
		</div>
		<p class="line-clamp-2 text-sm">{order.description}</p>
		<div class="flex flex-wrap gap-2">
			<StatusBadge status={order.status} />
			<PriorityBadge priority={order.priority} />
		</div>
	</div>
	<ChevronRightIcon class="size-5 shrink-0 text-muted-foreground" />
</a>
