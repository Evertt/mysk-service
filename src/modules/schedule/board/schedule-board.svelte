<!--
	@component
	The dispatch board for a week: a row per engineer (and one for unassigned orders) and a column
	per day, with the backlog of unscheduled orders beside it. Orders are planned by dragging them
	onto a cell, or with the schedule dialog. Narrow screens get a list per day instead.

	Like a list page, the board fits the viewport on wide screens (that aren't too low, see the
	`desktop` variant) and scrolls inside, both ways: its row of days and its column of engineers
	stay in view. Elsewhere the page scrolls, and the day headings of the list stick to the top.
-->
<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MediaQuery } from "svelte/reactivity";

	import { getTimeZone } from "#lib/dates.ts";
	import { specialties } from "#lib/engineers/index.ts";

	import ScheduleDialog from "../form/schedule-dialog.svelte";
	import BacklogCard from "./backlog-card.svelte";
	import { createBoardDrag } from "./board-drag.svelte.ts";
	import {
		type BoardRow,
		boardEngineers,
		groupByCell,
		type RowId,
		type Schedule,
		type ScheduleOrder,
		weekDays,
	} from "./board.ts";
	import DayList from "./day-list.svelte";
	import WeekGrid from "./week-grid.svelte";

	let { schedule, week }: { schedule: Schedule; week: string } = $props();

	const today = Temporal.Now.plainDateISO(getTimeZone());
	// Where the board is shown (`lg`), the page fits the viewport (see `(app)/+layout.svelte`); below
	// that, the list scrolls with the page. Assumed wide until known, so the board doesn't jump on
	// load; on a narrower screen the switch happens before anything's scrolled.
	const wide = new MediaQuery("min-width: 64rem", true);
	const days = $derived(weekDays(schedule.start));
	const engineers = $derived(boardEngineers(schedule.engineers, schedule.orders));
	// Unassigned work first, next to the backlog: it's what still needs an engineer.
	const rows: BoardRow[] = $derived([
		{
			id: "unassigned" as RowId,
			name: m.common_unassigned(),
			detail: m.schedule_no_engineer_yet(),
			droppable: true,
		},
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
	const ordersOn = (day: Temporal.PlainDate) =>
		schedule.orders
			.filter((order) =>
				order.scheduledFor?.toZonedDateTimeISO(getTimeZone()).toPlainDate().equals(day),
			)
			.sort((a, b) => Temporal.Instant.compare(a.scheduledFor!, b.scheduledFor!));

	const drag = createBoardDrag({
		week: () => week,
		names: () => names,
	});

	// The schedule dialog, for planning without dragging.
	let selected = $state.raw<ScheduleOrder>();
	let dialogOpen = $state(false);
	const defaultDay = $derived(days.find((day) => day.equals(today)) ?? days[0]);

	function openDialog(order: ScheduleOrder) {
		selected = order;
		dialogOpen = true;
	}

	/** After planning in the dialog, shows the week the order went to. */
	function showWeekOf(day: Temporal.PlainDate) {
		const start = day.subtract({ days: day.dayOfWeek - 1 }).toString();
		if (start !== week) void goto(`${resolve("/(app)/(modules)/schedule")}?week=${start}`);
	}
</script>

<div
	data-fill-viewport={wide.current || undefined}
	class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:desktop:min-h-0 lg:desktop:grid-rows-[minmax(0,1fr)]"
>
	<section
		aria-label={m.schedule_week()}
		class="min-w-0 lg:desktop:flex lg:desktop:max-h-full lg:desktop:flex-col"
	>
		<WeekGrid {days} {rows} {cells} {today} {ordersOn} {drag} onschedule={openDialog} />
		<DayList {days} {today} {ordersOn} {names} onschedule={openDialog} />
	</section>

	<BacklogCard backlog={schedule.backlog} {drag} onschedule={openDialog} />
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
