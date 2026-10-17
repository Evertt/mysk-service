<!--
	@component
	The month, week and day switch above the schedule: links, so each view has its URL. Another view
	shows today if the current period has it, else the period's first day. On the page's band, in
	the band's colours (`SegmentedNav`).
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import SegmentedNav from "#lib/components/segmented-nav.svelte";

	import { focusDay, type ScheduleView, scheduleViews, viewSearch } from "./calendar.ts";

	let {
		view,
		day,
		today,
		variant = "default",
	}: {
		view: ScheduleView;
		/** A day of the period shown. */
		day: Temporal.PlainDate;
		today: Temporal.PlainDate;
		variant?: "default" | "band";
	} = $props();

	const labels: Record<ScheduleView, () => string> = {
		month: m.schedule_month,
		week: m.schedule_week,
		day: m.schedule_day,
	};
	const focus = $derived(focusDay(view, day, today));
	const items = $derived(
		scheduleViews.map((each) => ({
			label: labels[each](),
			href: `${resolve("/(app)/(modules)/schedule")}${viewSearch(each, focus)}`,
			current: each === view,
		})),
	);
</script>

<SegmentedNav label={m.schedule_view()} {items} {variant} />
