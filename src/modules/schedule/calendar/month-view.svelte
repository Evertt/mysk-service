<!--
	@component
	The schedule's month: a legend of the order types' colours, the calendar of its six weeks on
	wide screens and a list of its busy days on narrow ones. Like the board, it asks for the month
	again when someone changes an order, an engineer or a customer (`watchSchedule`).
-->
<script lang="ts">
	import { untrack } from "svelte";

	import { currentDay } from "#lib/dates.ts";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";

	import { getScheduleMonth, watchSchedule } from "../schedule.remote.ts";
	import { groupByDay, type ScheduleMonth } from "./calendar.ts";
	import MonthGrid from "./month-grid.svelte";
	import MonthList from "./month-list.svelte";
	import TypeLegend from "./type-legend.svelte";

	let { schedule }: { schedule: ScheduleMonth } = $props();

	const today = currentDay();
	const days = $derived(groupByDay(schedule.orders));
	const names = $derived(new Map(schedule.engineers.map((e) => [e.id, e.name])));

	// Its first answer too, if it's later than the month's (`changedAt`): see the board's.
	refreshOnChange(
		watchSchedule,
		() => getScheduleMonth(schedule.month.toString()).refresh(),
		() => schedule.changedAt,
	);
</script>

<section aria-label={m.schedule_month()} class="flex flex-col gap-3">
	<TypeLegend />
	<MonthGrid month={schedule.month} {today} {days} {names} />
	<MonthList month={schedule.month} {today} {days} {names} />
</section>
