<!--
	@component
	The board on wide screens: engineers × days (the week's, or a single day's). The header row and the engineers' column are sticky
	and opaque, above the cells (z-10 to z-30). Scrolling a card into view keeps it clear of them.
	Cards are dragged between cells (`drag`), or planned with `onschedule`.
-->
<script lang="ts">
	import { EngineerLink } from "#lib/engineers/components.ts";
	import { formatLongDay } from "#lib/i18n/index.ts";
	import { cn } from "#lib/utils.ts";

	import type { createBoardDrag } from "./board-drag.svelte.ts";
	import { type BoardRow, cellKey, formatDay, load, type ScheduleOrder } from "./board.ts";
	import OrderCard from "./order-card.svelte";

	let {
		days,
		rows,
		cells,
		today,
		ordersOn,
		drag,
		onschedule,
	}: {
		days: Temporal.PlainDate[];
		rows: BoardRow[];
		/** The orders by cell (see `cellKey`). */
		cells: Map<string, ScheduleOrder[]>;
		/** The day to highlight (`yyyy-mm-dd`). */
		today: Temporal.PlainDate;
		/** The orders scheduled on a day, for the count in its header. */
		ordersOn: (day: Temporal.PlainDate) => ScheduleOrder[];
		drag: ReturnType<typeof createBoardDrag>;
		onschedule: (order: ScheduleOrder) => void;
	} = $props();

	const loadVariant = {
		none: "ghost",
		normal: "ghost",
		full: "secondary",
		over: "destructive",
	} as const;

	// The day view: one day's column.
	const single = $derived(days.length === 1);
</script>

<!-- Positioned, so the cards' visually hidden texts (`sr-only`, absolutely positioned) are placed
     in its scroll area, not below the page, which they would make taller. -->
<div
	class="relative hidden min-h-0 scroll-ps-32 scroll-pt-10 overflow-auto rounded-lg border bg-card lg:block"
>
	<div
		class={cn(
			"grid text-sm",
			single ? "grid-cols-[8rem_minmax(12rem,1fr)]" : "grid-cols-[8rem_repeat(7,minmax(6rem,1fr))]",
		)}
	>
		<div class="sticky start-0 top-0 z-30 border-e border-b bg-card p-2"></div>
		{#each days as day, i (day.toString())}
			{@const isToday = day.equals(today)}
			{@const count = ordersOn(day).length}
			<div
				data-day={day.toString()}
				class={cn(
					"sticky top-0 z-20 flex items-baseline justify-between gap-1 border-b bg-card p-2",
					i > 0 && "border-s",
					isToday && "bg-accent",
				)}
				aria-current={isToday ? "date" : undefined}
			>
				<span
					class={cn(
						"font-medium",
						isToday && "-mx-1.5 rounded-md bg-primary px-1.5 text-primary-foreground",
					)}
				>
					{formatDay(day)}
				</span>
				<span class="text-xs text-muted-foreground tabular-nums">{count || ""}</span>
			</div>
		{/each}

		{#each rows as row, r (row.id)}
			<div
				class={cn(
					"sticky start-0 z-10 flex flex-col gap-0.5 border-e bg-card p-2",
					r > 0 && "border-t",
				)}
			>
				{#if row.id === "unassigned"}
					<span class="font-medium">{row.name}</span>
				{:else}
					<EngineerLink
						id={row.id}
						name={row.name}
						class="truncate font-medium underline-offset-4 hover:underline"
					/>
				{/if}
				<span class="truncate text-xs text-muted-foreground">
					{row.droppable ? row.detail : m.schedule_inactive()}
				</span>
			</div>
			{#each days as day, i (day.toString())}
				{@const key = cellKey(row.id, day)}
				{@const orders = cells.get(key) ?? []}
				{@const level = load(orders.length)}
				<div
					role="group"
					aria-label={m.schedule_cell({ name: row.name, day: formatLongDay(day) })}
					data-load={level}
					class={cn(
						"min-h-24 min-w-0 gap-1 p-1 transition-colors",
						// A single day has room for the cards side by side.
						single
							? "grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] content-start"
							: "flex flex-col",
						r > 0 && "border-t",
						i > 0 && "border-s",
						day.equals(today) && "bg-accent/40",
						row.id !== "unassigned" && level === "over" && "bg-destructive/5",
						drag.target === key && "bg-primary/10 ring-2 ring-primary ring-inset",
					)}
					ondragover={row.droppable ? (event) => drag.over(event, key) : undefined}
					ondragleave={(event) => drag.leave(event, key)}
					ondrop={row.droppable ? (event) => drag.drop(event, row.id, day) : undefined}
				>
					{#if orders.length && row.id !== "unassigned"}
						<Badge
							variant={loadVariant[level]}
							class={cn(
								"h-4 px-1 text-[0.625rem] tabular-nums",
								single ? "col-span-full justify-self-end" : "self-end",
							)}
							title={level === "over" ? m.schedule_over_booked() : undefined}
						>
							{m.common_count_orders({ count: orders.length })}
						</Badge>
					{/if}
					{#each orders as order (order.id)}
						<OrderCard
							{order}
							pending={drag.isMoving(order)}
							ondragstart={(event) => drag.start(event, order)}
							ondragend={drag.end}
							onschedule={() => onschedule(order)}
						/>
					{/each}
				</div>
			{/each}
		{/each}
	</div>
</div>
