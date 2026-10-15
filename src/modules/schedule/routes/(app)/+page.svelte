<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	import PageHeader from "#lib/components/page-header.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";
	import { formatWeek, weekFromParam } from "#modules/schedule/board/board.ts";
	import ScheduleBoard from "#modules/schedule/board/schedule-board.svelte";
	import { getSchedule } from "#modules/schedule/schedule.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/schedule"> } = $props();

	// The week is in the URL (`?week=` any day of it), so it can be linked to; this week by default.
	const start = $derived(weekFromParam(page.url.searchParams.get("week")));
	const week = $derived(start.toString());
	const schedule = $derived(await getSchedule(week));

	const href = (day: Temporal.PlainDate) => `${resolve("/(app)/(modules)/schedule")}?week=${day}`;
	const isThisWeek = $derived(start.equals(weekFromParam(null)));
</script>

<svelte:head>
	<title>{m.schedule_title()}</title>
</svelte:head>

<PageHeader
	title={m.schedule_title()}
	description={m.schedule_description({
		week: formatNumber(start.weekOfYear!),
		range: formatWeek(start),
	})}
>
	{#snippet actions()}
		<Button
			href={href(start.subtract({ weeks: 1 }))}
			variant="outline"
			size="icon"
			aria-label={m.schedule_previous_week()}
		>
			<ChevronLeftIcon />
		</Button>
		<Button href={resolve("/(app)/(modules)/schedule")} variant="outline" disabled={isThisWeek}>
			{m.schedule_this_week()}
		</Button>
		<Button
			href={href(start.add({ weeks: 1 }))}
			variant="outline"
			size="icon"
			aria-label={m.schedule_next_week()}
		>
			<ChevronRightIcon />
		</Button>
	{/snippet}
</PageHeader>

<ScheduleBoard {schedule} {week} />
