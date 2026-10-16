<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	import PageHeader from "#lib/components/page-header.svelte";
	import { getTimeZone } from "#lib/dates.ts";
	import { formatNumber } from "#lib/i18n/index.ts";
	import { formatLongDay, formatWeek } from "#modules/schedule/board/board.ts";
	import ScheduleBoard from "#modules/schedule/board/schedule-board.svelte";
	import {
		formatMonth,
		inMonth,
		mondayOf,
		periodOf,
		type ScheduleView,
		shiftPeriod,
		viewFromParams,
		viewSearch,
	} from "#modules/schedule/calendar/calendar.ts";
	import MonthView from "#modules/schedule/calendar/month-view.svelte";
	import ViewSwitch from "#modules/schedule/calendar/view-switch.svelte";
	import { getSchedule, getScheduleMonth } from "#modules/schedule/schedule.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/schedule"> } = $props();

	const today = Temporal.Now.plainDateISO(getTimeZone());
	// The view and its day are in the URL (see `viewFromParams`), so they can be linked to and
	// survive a reload; this week by default.
	const current = $derived(viewFromParams(page.url.searchParams, today));
	const view = $derived(current.view);
	const start = $derived(periodOf(view, current.day).start);
	// The month loads its six weeks; the week and the day the week's board, backlog included.
	const month = $derived(view === "month" ? await getScheduleMonth(start.toString()) : undefined);
	const week = $derived(mondayOf(start).toString());
	const schedule = $derived(view === "month" ? undefined : await getSchedule(week));

	const isCurrent = $derived(start.equals(periodOf(view, today).start));
	const href = (day?: Temporal.PlainDate) =>
		`${resolve("/(app)/(modules)/schedule")}${viewSearch(view, day)}`;
	const steps: Record<ScheduleView, [previous: () => string, next: () => string]> = {
		month: [m.schedule_previous_month, m.schedule_next_month],
		week: [m.schedule_previous_week, m.schedule_next_week],
		day: [m.schedule_previous_day, m.schedule_next_day],
	};

	const description = $derived.by(() => {
		if (month) {
			const timeZone = getTimeZone();
			const count = month.orders.filter((order) =>
				inMonth(order.scheduledFor!.toZonedDateTimeISO(timeZone).toPlainDate(), start),
			).length;
			return m.schedule_month_description({ month: formatMonth(start), count });
		}
		if (view === "day") return m.schedule_day_description({ day: formatLongDay(start) });
		return m.schedule_description({
			week: formatNumber(start.weekOfYear!),
			range: formatWeek(start),
		});
	});
</script>

<svelte:head>
	<title>{m.schedule_title()}</title>
</svelte:head>

<PageHeader title={m.schedule_title()} {description}>
	{#snippet actions()}
		<ViewSwitch {view} day={start} {today} />
		<div class="flex items-center gap-2">
			<Button
				href={href(shiftPeriod(view, start, -1))}
				variant="outline"
				size="icon"
				aria-label={steps[view][0]()}
			>
				<ChevronLeftIcon />
			</Button>
			<Button href={href()} variant="outline" disabled={isCurrent}>
				{m.schedule_today()}
			</Button>
			<Button
				href={href(shiftPeriod(view, start, 1))}
				variant="outline"
				size="icon"
				aria-label={steps[view][1]()}
			>
				<ChevronRightIcon />
			</Button>
		</div>
	{/snippet}
</PageHeader>

{#if month}
	<MonthView schedule={month} />
{:else if schedule}
	<ScheduleBoard {schedule} {week} day={view === "day" ? start : undefined} />
{/if}
