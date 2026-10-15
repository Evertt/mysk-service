<!--
	@component
	An order on the dispatch board: time, number, customer and type, with its priority as the colour
	of the left edge. Open orders can be dragged (`ondragstart`) and have a button to plan them in a
	dialog (`onschedule`).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";

	import { formatDate, formatTime } from "#lib/i18n/index.ts";
	import { isOpenOrder, type OrderPriority } from "#lib/models.ts";
	import { priorities, statuses, types } from "#lib/orders/index.ts";
	import { cn } from "#lib/utils.ts";

	import type { getSchedule } from "../schedule.remote.ts";

	type Order = Awaited<ReturnType<typeof getSchedule>>["orders"][number];

	let {
		order,
		engineer,
		pending = false,
		ondragstart,
		ondragend,
		onschedule,
	}: {
		order: Order;
		/** The engineer's name, where the card isn't in the engineer's row. */
		engineer?: string;
		/** Whether a move of this order is on its way to the server. */
		pending?: boolean;
		ondragstart?: (event: DragEvent) => void;
		ondragend?: (event: DragEvent) => void;
		onschedule?: () => void;
	} = $props();

	const open = $derived(isOpenOrder(order.status));
	const priority = $derived(priorities[order.priority]);
	const type = $derived(types[order.type]);
	// E.g. `ORD-`, shown only to screen readers.
	const prefix = $derived(/^[A-Z]+-/.exec(order.number)?.[0] ?? "");

	const edge: Record<OrderPriority, string> = {
		low: "border-l-border",
		normal: "border-l-muted-foreground/40",
		high: "border-l-primary",
		urgent: "border-l-destructive",
	};
</script>

<div
	class={cn(
		"flex flex-col gap-0.5 rounded-md border border-l-4 bg-card p-1.5 text-xs shadow-xs",
		edge[order.priority],
		open ? "cursor-grab active:cursor-grabbing" : "opacity-60",
		pending && "animate-pulse",
	)}
	draggable={open}
	{ondragstart}
	{ondragend}
	data-order={order.number}
	role="group"
	aria-label={order.number}
>
	<div class="flex items-center gap-1">
		<span class="text-muted-foreground tabular-nums">
			{order.scheduledFor
				? formatTime(order.scheduledFor)
				: m.schedule_since({ date: formatDate(order.createdAt) })}
		</span>
		<span title={m.schedule_priority({ priority: priority.label })}>
			<priority.icon
				class={cn("size-3", order.priority === "urgent" && "text-destructive")}
				aria-hidden="true"
			/>
			<span class="sr-only">{m.schedule_priority({ priority: priority.label })}</span>
		</span>
		{#if !open}
			<span class="text-muted-foreground">{statuses[order.status].label}</span>
		{/if}
		{#if open && onschedule}
			<Button
				variant="ghost"
				size="icon-xs"
				class="-my-1 ms-auto"
				aria-label={m.schedule_order({ number: order.number })}
				title={m.schedule_order_ellipsis()}
				onclick={onschedule}
			>
				<CalendarClockIcon />
			</Button>
		{/if}
	</div>
	<!--
		Not preloaded on hover: dragging a card over the others would preload their pages, each in a
		fork (`forkPreloads`), and a card the move re-created meanwhile never ran its effects, so it
		kept pulsing (docs/upstream-bugs/README.md, 8).
	-->
	<a
		href={resolve("/(app)/orders/[number]", { number: order.number })}
		class="truncate font-medium underline-offset-4 hover:underline"
		draggable="false"
		data-sveltekit-preload-data="off"
		title={order.number}
	>
		<!-- The prefix is the same on every card; the rest fits a narrow column. -->
		<span class="sr-only">{prefix}</span>{order.number.slice(prefix.length)}
	</a>
	<span class="truncate" title={order.customer.name}>{order.customer.name}</span>
	<span class="flex items-center gap-1 truncate text-muted-foreground">
		<type.icon class="size-3 shrink-0" />
		{type.label}{#if engineer}&ensp;·&ensp;{engineer}{/if}
	</span>
</div>
