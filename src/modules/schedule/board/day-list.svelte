<!--
	@component
	The board on narrow screens: a list per day, whose heading sticks to the top while its day's
	orders scroll by. The orders can't be dragged here, only planned with `onschedule`.
-->
<script lang="ts">
	import { formatLongDay, type ScheduleOrder } from "./board.ts";
	import OrderCard from "./order-card.svelte";

	let {
		days,
		today,
		ordersOn,
		names,
		onschedule,
	}: {
		days: Temporal.PlainDate[];
		/** The day to mark (`yyyy-mm-dd`). */
		today: Temporal.PlainDate;
		/** The orders scheduled on a day. */
		ordersOn: (day: Temporal.PlainDate) => ScheduleOrder[];
		/** The engineers' names by id, shown on the cards. */
		names: Map<number, string>;
		onschedule: (order: ScheduleOrder) => void;
	} = $props();
</script>

<div class="flex flex-col gap-4 lg:hidden">
	{#each days as day (day.toString())}
		{@const orders = ordersOn(day)}
		{@const isToday = day.equals(today)}
		<section aria-label={formatLongDay(day)} class="flex flex-col gap-2">
			<!-- Sticks to the top while its day's orders scroll by, opaque above them. -->
			<h2
				class="sticky top-0 z-10 -my-1.5 flex items-center gap-2 bg-background py-1.5 text-sm font-medium"
				aria-current={isToday ? "date" : undefined}
			>
				{formatLongDay(day)}
				{#if isToday}<Badge>{m.schedule_today()}</Badge>{/if}
				<span class="ms-auto text-xs text-muted-foreground tabular-nums">
					{m.common_count_orders({ count: orders.length })}
				</span>
			</h2>
			{#each orders as order (order.id)}
				<OrderCard
					{order}
					engineer={order.engineerId ? names.get(order.engineerId) : m.common_unassigned()}
					onschedule={() => onschedule(order)}
				/>
			{:else}
				<p class="text-sm text-muted-foreground">{m.schedule_nothing_scheduled()}</p>
			{/each}
		</section>
	{/each}
</div>
