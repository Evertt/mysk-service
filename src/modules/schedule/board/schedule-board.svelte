<!--
	@component
	The dispatch board for a week (or one day of it, `day`): a row per engineer (and one for
	unassigned orders) and a column per day, with the backlog of unscheduled orders beside it. Orders are planned by dragging them
	onto a cell, or with the schedule dialog. Narrow screens get a list per day instead.

	Like a list page, the board fits the viewport on wide screens (that aren't too low, see the
	`desktop` variant) and scrolls inside, both ways: its row of days and its column of engineers
	stay in view. Elsewhere the page scrolls, and the day headings of the list stick to the top.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { untrack } from "svelte";
	import { MediaQuery } from "svelte/reactivity";

	import { historyDialog } from "#lib/components/history-dialog.svelte.ts";
	import { currentDay, dayOf } from "#lib/dates.ts";
	import { engineerSpecialtyDisplay } from "#lib/engineers/index.ts";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";

	import { viewSearch } from "../calendar/calendar.ts";
	import ScheduleDialog from "../form/schedule-dialog.svelte";
	import { getSchedule, watchSchedule } from "../schedule.remote.ts";
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

	let {
		schedule,
		week,
		day,
	}: {
		schedule: Schedule;
		/** The week's Monday (`yyyy-mm-dd`), as `schedule` was asked for. */
		week: string;
		/** The day the board shows, a day of the week; the whole week without. */
		day?: Temporal.PlainDate;
	} = $props();

	const today = currentDay();
	// Where the board is shown (`lg`), the page fits the viewport (see `(app)/+layout.svelte`); below
	// that, the list scrolls with the page. Assumed wide until known, so the board doesn't jump on
	// load; on a narrower screen the switch happens before anything's scrolled.
	const wide = new MediaQuery("min-width: 64rem", true);
	const days = $derived(day ? [day] : weekDays(schedule.start));
	const engineers = $derived(boardEngineers(schedule.engineers, schedule.orders, days));
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
			detail: engineerSpecialtyDisplay[engineer.specialty].label,
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
			.filter((order) => order.scheduledFor && dayOf(order.scheduledFor).equals(day))
			.sort((a, b) => Temporal.Instant.compare(a.scheduledFor!, b.scheduledFor!));

	// Live: when someone changes an order, an engineer or a customer, the board asks for the week
	// again (`watchSchedule`). Not while a move of its own is on its way: that brings the week back
	// itself, and a refresh that started before it could answer from before it, putting the order
	// back where it came from. So it waits for the moves (`settled`), and asks again if one started
	// while it asked. The live query's first answer is a change too if it's later than the week's
	// (`changedAt`): one made after the board asked for the week (the service worker may answer it
	// from its cache) and before the live query opened.
	let outdated = false;
	refreshOnChange(
		watchSchedule,
		() => {
			outdated = true;
			if (!drag.busy) void refresh();
		},
		() => schedule.changedAt,
	);

	async function refresh() {
		outdated = false;
		const moves = drag.started;
		await getSchedule(week).refresh();
		if (drag.started !== moves) outdated = true;
		if (outdated && !drag.busy) void refresh();
	}

	const drag = createBoardDrag({
		week: () => week,
		names: () => names,
		settled: () => {
			if (outdated) void refresh();
		},
	});

	// The schedule dialog, for planning without dragging. It has a history entry of its own, so
	// going back closes it and forward opens it again (with the order as the board has it then).
	const dialog = historyDialog("schedule");
	// The order last opened, kept while the dialog closes.
	let opened = $state.raw<ScheduleOrder>();
	const selected = $derived(
		[...schedule.orders, ...schedule.backlog].find((order) => String(order.id) === dialog.value) ??
			opened,
	);
	const defaultDay = $derived(days.find((each) => each.equals(today)) ?? days[0]);

	function openDialog(order: ScheduleOrder) {
		opened = order;
		dialog.show(String(order.id));
	}

	/** After planning in the dialog, shows the week (or the day) the order went to. */
	function showPlanned(planned: Temporal.PlainDate) {
		const view = day ? "day" : "week";
		const there = viewSearch(view, planned);
		if (there !== viewSearch(view, day ?? schedule.start)) {
			void dialog.leave(`${resolve("/(app)/(modules)/schedule")}${there}`);
		}
	}
</script>

<div
	data-fill-viewport={wide.current || undefined}
	class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:desktop:min-h-0 lg:desktop:grid-rows-[minmax(0,1fr)]"
>
	<section
		aria-label={day ? m.schedule_day() : m.schedule_week()}
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
		history={dialog}
		onscheduled={showPlanned}
	/>
{/if}
