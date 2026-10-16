<!--
	@component
	An order on the month's calendar, as the client's planning shows an appointment: its time,
	customer and type, tinted in its type's colour, linking to the order's page. The engineer is
	shown by initials (`compact`, where the calendar's cells are narrow) or by name.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatTime } from "#lib/i18n/index.ts";
	import { types, unitsSummary } from "#lib/orders/index.ts";
	import { cn } from "#lib/utils.ts";

	import { initials, type ScheduleMonthOrder } from "./calendar.ts";
	import { typeColors } from "./type-colors.ts";

	let {
		order,
		engineer,
		compact = false,
	}: {
		order: ScheduleMonthOrder;
		/** The engineer's name, if the order has one. */
		engineer?: string;
		compact?: boolean;
	} = $props();

	const type = $derived(types[order.type]);
	const color = $derived(typeColors[order.type]);
	// Its first unit and how many more, e.g. "Deur 07 +14".
	const units = $derived(unitsSummary(order.unit, order.unitCount));
	const details = $derived(
		[order.number, order.customer.name, type.label, units, order.description, engineer]
			.filter(Boolean)
			.join(" · "),
	);
</script>

<a
	href={resolve("/(app)/orders/[number]", { number: order.number })}
	class={cn(
		"flex min-w-0 items-center rounded-sm border transition-colors",
		// Compact in a calendar cell; roomier, for a finger, in the list.
		compact ? "gap-1 px-1 py-0.5 text-xs leading-4" : "gap-2 px-2 py-1.5 text-sm",
		color.entry,
	)}
	data-order={order.number}
	data-type={order.type}
	title={details}
>
	<type.icon
		class={cn("shrink-0", compact ? "size-3" : "size-3.5", color.icon)}
		aria-hidden="true"
	/>
	{#if order.scheduledFor}
		<span class="shrink-0 font-medium tabular-nums">{formatTime(order.scheduledFor)}</span>
	{/if}
	<span class="min-w-0 truncate">
		{order.customer.name} — {type.label}{#if units && !compact}<span
				class="text-muted-foreground"
				data-units
			>
				· {units}</span
			>{/if}
	</span>
	{#if engineer}
		{#if compact}
			<!-- Initials where they fit; screen readers get the name. -->
			<span class="ms-auto hidden shrink-0 text-[0.625rem] opacity-70 xl:inline" aria-hidden="true">
				{initials(engineer)}
			</span>
			<span class="sr-only">, {engineer}</span>
		{:else}
			<span class="ms-auto max-w-[40%] shrink-0 truncate opacity-70">{engineer}</span>
		{/if}
	{/if}
</a>
