<!--
	@component
	The dashboard's orders per week: a stacked bar per week of the last twelve, a segment per status
	in the status badges' colours, with a legend, and the same numbers in a visually hidden table.
-->
<script lang="ts">
	import { BarChart } from "layerchart";

	import type { ChartConfig } from "#lib/components/ui/chart/index.ts";
	import { dateFormatter, formatNumber } from "#lib/i18n/index.ts";
	import { orderStatuses } from "#lib/models.ts";
	import { statuses } from "#lib/orders/index.ts";

	import ChartTable from "./chart-table.svelte";
	import type { OrdersInWeek } from "./dashboard-charts.ts";

	let { data }: { data: OrdersInWeek[] } = $props();

	// The chart's scale keys its bars by value: the weeks as text (`yyyy-mm-dd`, their Mondays).
	const bars = $derived(data.map((week) => ({ ...week, week: week.week.toString() })));
	const monday = (week: string) => Temporal.PlainDate.from(week);

	const tick = dateFormatter({ day: "numeric", month: "short" });
	const days = dateFormatter({ day: "numeric", month: "short", year: "numeric" });
	/** A week by its days, e.g. `5 – 11 Oct 2026`. */
	const weekLabel = (week: Temporal.PlainDate) => days.range(week, week.add({ days: 6 }));
	/** Whole numbers only on the count axis. */
	const countTick = (value: number) => (Number.isInteger(value) ? formatNumber(value) : "");
	/**
	 * Every n-th week's label, counting back from the latest, with n such that labels (`28 Sept`
	 * is about 45px) sit at least 56px apart: every week on a wide card, every other or third
	 * on a narrow one.
	 */
	const weekTicks = (scale: unknown) => {
		const band = scale as { domain(): string[]; step(): number };
		const weeks = band.domain();
		const every = Math.max(1, Math.ceil(56 / band.step()));
		return weeks.filter((_, i) => (weeks.length - 1 - i) % every === 0);
	};

	const config = $derived(
		Object.fromEntries(
			orderStatuses.map((status) => [
				status,
				{ label: statuses[status].label, color: statuses[status].color },
			]),
		) satisfies ChartConfig,
	);
	const series = $derived(
		orderStatuses.map((status) => ({
			key: status,
			label: statuses[status].label,
			color: statuses[status].color,
		})),
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.dashboard_orders_per_week()}</Card.Title>
		<Card.Description>{m.dashboard_orders_per_week_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="flex flex-col gap-3" aria-hidden="true">
			<Chart.Container {config} class="aspect-auto h-64 w-full">
				<BarChart
					data={bars}
					x="week"
					{series}
					seriesLayout="stack"
					stackPadding={2}
					props={{
						// Only as many week labels as fit, evenly spaced, the latest for sure; the occlusion
						// check is the backstop for a label that still turns out wider.
						xAxis: {
							format: (week: string) => tick(monday(week)),
							ticks: weekTicks,
							tickOcclusion: { padding: 8 },
						},
						yAxis: { format: countTick },
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip labelFormatter={(week: string) => weekLabel(monday(week))} />
					{/snippet}
				</BarChart>
			</Chart.Container>
			<!-- The chart's own legend sits inside its box and overlaps the bars when it wraps. -->
			<ul class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
				{#each series as { key, label, color } (key)}
					<li class="flex items-center gap-1.5">
						<span class="size-2.5 shrink-0 rounded-[2px]" style:background-color={color}></span>
						{label}
					</li>
				{/each}
			</ul>
		</div>
		<ChartTable
			caption={m.dashboard_orders_per_week()}
			columns={[
				m.dashboard_column_week(),
				...orderStatuses.map((status) => statuses[status].label),
			]}
			rows={data.map((week) => [
				weekLabel(week.week),
				...orderStatuses.map((status) => formatNumber(week[status])),
			])}
		/>
	</Card.Content>
</Card.Root>
