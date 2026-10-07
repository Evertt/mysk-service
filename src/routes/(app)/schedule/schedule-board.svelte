<!--
	@component
	The dispatch board for a week: a row per engineer (and one for unassigned orders) and a column
	per day, with the backlog of unscheduled orders beside it. Orders are planned by dragging them
	onto a cell, or with the schedule dialog. Narrow screens get a list per day instead.
-->
<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { isHttpError } from "@sveltejs/kit";
	import { toast } from "svelte-sonner";
	import { SvelteSet } from "svelte/reactivity";

	import { specialties } from "#lib/components/engineers/display.js";
	import { atTime, timeOfDay } from "#lib/schema.js";
	import { cn } from "#lib/utils.js";

	import {
		applyMove,
		boardEngineers,
		cellKey,
		DEFAULT_TIME,
		dayKey,
		formatDay,
		formatLongDay,
		groupByCell,
		load,
		type RowId,
		startOfWeek,
		weekDays,
	} from "./board.js";
	import OrderCard from "./order-card.svelte";
	import ScheduleDialog from "./schedule-dialog.svelte";
	import { getSchedule, moveOrder } from "./schedule.remote.js";

	type Schedule = Awaited<ReturnType<typeof getSchedule>>;
	type Order = Schedule["orders"][number];

	let { schedule, week }: { schedule: Schedule; week: string } = $props();

	const today = dayKey(new Date());
	const days = $derived(weekDays(schedule.start));
	const engineers = $derived(boardEngineers(schedule.engineers, schedule.orders));
	// Unassigned work first, next to the backlog: it's what still needs an engineer.
	const rows = $derived([
		{ id: "unassigned" as RowId, name: "Unassigned", detail: "No engineer yet", droppable: true },
		...engineers.map((engineer) => ({
			id: engineer.id as RowId,
			name: engineer.name,
			detail: specialties[engineer.specialty].label,
			droppable: engineer.active,
		})),
	]);
	const cells = $derived(
		groupByCell(
			schedule.orders,
			engineers.map((engineer) => engineer.id),
		),
	);
	const names = $derived(new Map(schedule.engineers.map((e) => [e.id, e.name])));
	const ordersOn = (day: Date) =>
		schedule.orders
			.filter((order) => order.scheduledFor && dayKey(order.scheduledFor) === dayKey(day))
			.sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime());

	// Drag and drop: the order being dragged, and the cell it's over.
	let dragging = $state.raw<Order>();
	let target = $state<string>();
	const moving = new SvelteSet<number>();

	function dragStart(event: DragEvent, order: Order) {
		event.dataTransfer?.setData("text/plain", order.number);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
		dragging = order;
	}

	function dragOver(event: DragEvent, key: string) {
		if (!dragging) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		target = key;
	}

	function dragLeave(event: DragEvent, key: string) {
		const cell = event.currentTarget as HTMLElement;
		if (target === key && !cell.contains(event.relatedTarget as Node | null)) target = undefined;
	}

	async function drop(event: DragEvent, row: RowId, day: Date) {
		event.preventDefault();
		const order = dragging;
		dragging = target = undefined;
		if (!order) return;

		const engineerId = row === "unassigned" ? null : row;
		// Moves keep the time of day; orders from the backlog start at the default time.
		const time = order.scheduledFor ? timeOfDay(order.scheduledFor) : DEFAULT_TIME;
		const scheduledFor = atTime(day, time);
		if (order.engineerId === engineerId && order.scheduledFor?.getTime() === scheduledFor.getTime())
			return;

		moving.add(order.id);
		try {
			await moveOrder({ id: order.id, engineerId, day: dayKey(day), time }).updates(
				getSchedule(week).withOverride((current) =>
					applyMove(current, { id: order.id, engineerId, scheduledFor }),
				),
			);
			const who = engineerId ? names.get(engineerId) : "nobody";
			toast.success(`${order.number}: ${who}, ${formatDay(day)} ${time}`);
		} catch (error) {
			toast.error(isHttpError(error) ? error.body.message : `Couldn't move ${order.number}`);
		} finally {
			moving.delete(order.id);
		}
	}

	// The schedule dialog, for planning without dragging.
	let selected = $state.raw<Order>();
	let dialogOpen = $state(false);
	const defaultDay = $derived(days.find((day) => dayKey(day) === today) ?? days[0]);

	function openDialog(order: Order) {
		selected = order;
		dialogOpen = true;
	}

	/** After planning in the dialog, shows the week the order went to. */
	function showWeekOf(day: Date) {
		const start = dayKey(startOfWeek(day));
		if (start !== week) void goto(`${resolve("/(app)/schedule")}?week=${start}`);
	}

	const loadVariant = {
		none: "ghost",
		normal: "ghost",
		full: "secondary",
		over: "destructive",
	} as const;
</script>

<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
	<section aria-label="Week" class="min-w-0">
		<!-- Wide screens: engineers × days. -->
		<div class="hidden overflow-x-auto rounded-lg border bg-card lg:block">
			<div class="grid grid-cols-[8rem_repeat(7,minmax(6rem,1fr))] text-sm">
				<div class="sticky left-0 bg-card p-2"></div>
				{#each days as day (dayKey(day))}
					{@const isToday = dayKey(day) === today}
					{@const count = ordersOn(day).length}
					<div
						class={cn(
							"flex items-baseline justify-between gap-1 border-l p-2",
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

				{#each rows as row (row.id)}
					<div class="sticky left-0 z-10 flex flex-col gap-0.5 border-t bg-card p-2">
						{#if row.id === "unassigned"}
							<span class="font-medium">{row.name}</span>
						{:else}
							<a
								href={resolve("/(app)/engineers/[id]", { id: String(row.id) })}
								class="truncate font-medium underline-offset-4 hover:underline"
							>
								{row.name}
							</a>
						{/if}
						<span class="truncate text-xs text-muted-foreground">
							{row.droppable ? row.detail : "Inactive"}
						</span>
					</div>
					{#each days as day (dayKey(day))}
						{@const key = cellKey(row.id, day)}
						{@const orders = cells.get(key) ?? []}
						{@const level = load(orders.length)}
						<div
							role="group"
							aria-label="{row.name} on {formatLongDay(day)}"
							data-load={level}
							class={cn(
								"flex min-h-24 min-w-0 flex-col gap-1 border-t border-l p-1 transition-colors",
								dayKey(day) === today && "bg-accent/40",
								row.id !== "unassigned" && level === "over" && "bg-destructive/5",
								target === key && "bg-primary/10 ring-2 ring-primary ring-inset",
							)}
							ondragover={row.droppable ? (event) => dragOver(event, key) : undefined}
							ondragleave={(event) => dragLeave(event, key)}
							ondrop={row.droppable ? (event) => drop(event, row.id, day) : undefined}
						>
							{#if orders.length && row.id !== "unassigned"}
								<Badge
									variant={loadVariant[level]}
									class="h-4 self-end px-1 text-[0.625rem] tabular-nums"
									title={level === "over" ? "Over-booked" : undefined}
								>
									{orders.length}
									{orders.length === 1 ? "order" : "orders"}
								</Badge>
							{/if}
							{#each orders as order (order.id)}
								<OrderCard
									{order}
									pending={moving.has(order.id)}
									ondragstart={(event) => dragStart(event, order)}
									ondragend={() => (dragging = target = undefined)}
									onschedule={() => openDialog(order)}
								/>
							{/each}
						</div>
					{/each}
				{/each}
			</div>
		</div>

		<!-- Narrow screens: a list per day. -->
		<div class="flex flex-col gap-4 lg:hidden">
			{#each days as day (dayKey(day))}
				{@const orders = ordersOn(day)}
				{@const isToday = dayKey(day) === today}
				<section aria-label={formatLongDay(day)} class="flex flex-col gap-2">
					<h2
						class="flex items-center gap-2 text-sm font-medium"
						aria-current={isToday ? "date" : undefined}
					>
						{formatLongDay(day)}
						{#if isToday}<Badge>Today</Badge>{/if}
						<span class="ms-auto text-xs text-muted-foreground tabular-nums">
							{orders.length}
							{orders.length === 1 ? "order" : "orders"}
						</span>
					</h2>
					{#each orders as order (order.id)}
						<OrderCard
							{order}
							engineer={order.engineerId ? names.get(order.engineerId) : "Unassigned"}
							onschedule={() => openDialog(order)}
						/>
					{:else}
						<p class="text-sm text-muted-foreground">Nothing scheduled.</p>
					{/each}
				</section>
			{/each}
		</div>
	</section>

	<Card.Root
		size="sm"
		role="region"
		aria-label="Backlog"
		class="lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)]"
	>
		<Card.Header>
			<Card.Title>Backlog</Card.Title>
			<Card.Description>
				{schedule.backlog.length} open {schedule.backlog.length === 1 ? "order" : "orders"} without a
				date. Drag one onto the week.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
			{#each schedule.backlog as order (order.id)}
				<OrderCard
					{order}
					pending={moving.has(order.id)}
					ondragstart={(event) => dragStart(event, order)}
					ondragend={() => (dragging = target = undefined)}
					onschedule={() => openDialog(order)}
				/>
			{:else}
				<p class="text-sm text-muted-foreground">Everything is scheduled.</p>
			{/each}
		</Card.Content>
	</Card.Root>
</div>

{#if selected}
	<ScheduleDialog
		order={selected}
		engineers={schedule.engineers}
		{week}
		{defaultDay}
		bind:open={dialogOpen}
		onscheduled={showWeekOf}
	/>
{/if}
