<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	import PageHeader from "#lib/components/page-header.svelte";
	import { addDays } from "#lib/dates.ts";
	import { formatNumber } from "#lib/format.ts";

	import { dayKey, formatWeek, startOfWeek, weekFromParam, weekNumber } from "./board.ts";
	import ScheduleBoard from "./schedule-board.svelte";
	import { getSchedule } from "./schedule.remote.ts";

	// The week is in the URL (`?week=` any day of it), so it can be linked to; this week by default.
	const start = $derived(weekFromParam(page.url.searchParams.get("week")));
	const week = $derived(dayKey(start));
	const schedule = $derived(await getSchedule(week));

	const href = (day: Date) => `${resolve("/(app)/schedule")}?week=${dayKey(day)}`;
	const isThisWeek = $derived(week === dayKey(startOfWeek(new Date())));
</script>

<svelte:head>
	<title>{m.schedule_title()}</title>
</svelte:head>

<PageHeader
	title={m.schedule_title()}
	description={m.schedule_description({
		week: formatNumber(weekNumber(start)),
		range: formatWeek(start),
	})}
>
	{#snippet actions()}
		<Button
			href={href(addDays(start, -7))}
			variant="outline"
			size="icon"
			aria-label={m.schedule_previous_week()}
		>
			<ChevronLeftIcon />
		</Button>
		<Button href={resolve("/(app)/schedule")} variant="outline" disabled={isThisWeek}>
			{m.schedule_this_week()}
		</Button>
		<Button
			href={href(addDays(start, 7))}
			variant="outline"
			size="icon"
			aria-label={m.schedule_next_week()}
		>
			<ChevronRightIcon />
		</Button>
	{/snippet}
</PageHeader>

<ScheduleBoard {schedule} {week} />
