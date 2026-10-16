<!--
	@component
	The month, week and day switch above the schedule: links, so each view has its URL. Another view
	shows today if the current period has it, else the period's first day.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { cn } from "#lib/utils.ts";

	import { focusDay, type ScheduleView, scheduleViews, viewSearch } from "./calendar.ts";

	let {
		view,
		day,
		today,
	}: {
		view: ScheduleView;
		/** A day of the period shown. */
		day: Temporal.PlainDate;
		today: Temporal.PlainDate;
	} = $props();

	const labels: Record<ScheduleView, () => string> = {
		month: m.schedule_month,
		week: m.schedule_week,
		day: m.schedule_day,
	};
	const focus = $derived(focusDay(view, day, today));
</script>

<nav
	aria-label={m.schedule_view()}
	class="inline-flex rounded-md border bg-background p-0.5 shadow-xs"
>
	{#each scheduleViews as each (each)}
		<a
			href={`${resolve("/(app)/(modules)/schedule")}${viewSearch(each, focus)}`}
			aria-current={each === view ? "page" : undefined}
			class={cn(
				"rounded-sm px-3 py-1 text-sm font-medium transition-colors",
				each === view
					? "bg-primary text-primary-foreground"
					: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
			)}
		>
			{labels[each]()}
		</a>
	{/each}
</nav>
