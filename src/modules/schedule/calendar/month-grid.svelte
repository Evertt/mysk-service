<!--
	@component
	The month's calendar on wide screens: six weeks, Monday first, with the days outside the month
	muted and today highlighted. Each day lists its orders by time; a day with more than fit says
	how many more, linking to the day's view, as its number does.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatLongDay, formatNumber } from "#lib/i18n/index.ts";
	import { cn } from "#lib/utils.ts";

	import {
		cellEntries,
		formatWeekday,
		inMonth,
		monthWeeks,
		type ScheduleMonthOrder,
		viewSearch,
	} from "./calendar.ts";
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

	const weeks = $derived(monthWeeks(month));
	const dayHref = (day: Temporal.PlainDate) =>
		`${resolve("/(app)/(modules)/schedule")}${viewSearch("day", day)}`;
</script>

<!-- Positioned, so the entries' visually hidden texts are placed in it, not below the page. -->
<div class="relative hidden overflow-hidden rounded-lg border bg-card lg:block">
	<div
		class="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground"
		aria-hidden="true"
	>
		{#each weeks[0] as day, i (day.toString())}
			<div class={cn("px-2 py-1.5", i > 0 && "border-s")}>{formatWeekday(day)}</div>
		{/each}
	</div>
	<div class="grid grid-cols-7">
		{#each weeks as week, w (week[0].toString())}
			{#each week as day, i (day.toString())}
				{@const orders = days.get(day.toString()) ?? []}
				{@const { shown, more } = cellEntries(orders.length)}
				{@const isToday = day.equals(today)}
				{@const outside = !inMonth(day, month)}
				<div
					role="group"
					aria-label={formatLongDay(day)}
					aria-current={isToday ? "date" : undefined}
					data-day={day.toString()}
					data-outside={outside || undefined}
					class={cn(
						"flex min-h-28 min-w-0 flex-col gap-0.5 p-1",
						w > 0 && "border-t",
						i > 0 && "border-s",
						outside && "bg-muted/50 text-muted-foreground",
						isToday && "bg-accent/40",
					)}
				>
					<a
						href={dayHref(day)}
						class={cn(
							"self-start rounded-md px-1.5 text-xs font-medium tabular-nums underline-offset-4 hover:underline",
							isToday && "bg-primary text-primary-foreground",
						)}
						aria-label={formatLongDay(day)}
					>
						{formatNumber(day.day)}
					</a>
					{#each orders.slice(0, shown) as order (order.id)}
						<MonthEntry
							{order}
							engineer={order.engineerId ? names.get(order.engineerId) : undefined}
							compact
						/>
					{/each}
					{#if more}
						<a
							href={dayHref(day)}
							class="px-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
							aria-label={m.schedule_more_on({
								count: formatNumber(more),
								day: formatLongDay(day),
							})}
						>
							{m.schedule_more({ count: formatNumber(more) })}
						</a>
					{/if}
				</div>
			{/each}
		{/each}
	</div>
</div>
