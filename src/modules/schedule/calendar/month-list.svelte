<!--
	@component
	The month on narrow screens: a list of its days that have orders, whose headings stick to the
	top while their orders scroll by, each heading linking to the day's view.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatLongDay } from "../board/board.ts";
	import { inMonth, monthWeeks, type ScheduleMonthOrder, viewSearch } from "./calendar.ts";
	import MonthEntry from "./month-entry.svelte";

	let {
		month,
		today,
		days,
		names,
	}: {
		/** The month's first day. */
		month: Temporal.PlainDate;
		today: Temporal.PlainDate;
		/** The orders by day (`yyyy-mm-dd`), each day's by time. */
		days: Map<string, ScheduleMonthOrder[]>;
		/** The engineers' names by id. */
		names: Map<number, string>;
	} = $props();

	const busy = $derived(
		monthWeeks(month)
			.flat()
			.filter((day) => inMonth(day, month) && days.has(day.toString())),
	);
</script>

<div class="flex flex-col gap-4 lg:hidden">
	{#each busy as day (day.toString())}
		{@const orders = days.get(day.toString()) ?? []}
		{@const isToday = day.equals(today)}
		<section aria-label={formatLongDay(day)} class="flex flex-col gap-1.5">
			<h2
				class="sticky top-0 z-10 -my-1.5 flex items-center gap-2 bg-background py-1.5 text-sm font-medium"
				aria-current={isToday ? "date" : undefined}
			>
				<a
					href={`${resolve("/(app)/(modules)/schedule")}${viewSearch("day", day)}`}
					class="underline-offset-4 hover:underline"
				>
					{formatLongDay(day)}
				</a>
				{#if isToday}<Badge>{m.schedule_today()}</Badge>{/if}
				<span class="ms-auto text-xs text-muted-foreground tabular-nums">
					{m.common_count_orders({ count: orders.length })}
				</span>
			</h2>
			{#each orders as order (order.id)}
				<MonthEntry {order} engineer={order.engineerId ? names.get(order.engineerId) : undefined} />
			{/each}
		</section>
	{:else}
		<p class="text-sm text-muted-foreground">{m.schedule_month_empty()}</p>
	{/each}
</div>
