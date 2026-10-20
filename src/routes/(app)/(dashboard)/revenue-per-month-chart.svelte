<!--
	@component
	The dashboard's revenue per month: a bar per month of the last twelve with the priced total of
	the work completed in it, and the same amounts in a visually hidden table.
-->
<script lang="ts">
	import { BarChart } from "layerchart";

	import type { ChartConfig } from "#lib/components/ui/chart/index.ts";
	import {
		dateFormatter,
		formatCents,
		formatMonth,
		formatNumber,
		numberFormatter,
	} from "#lib/i18n/index.ts";

	import ChartTable from "./chart-table.svelte";
	import type { RevenueInMonth } from "./dashboard-charts.ts";
	import { settledWidth } from "./settled-width.ts";

	let { data }: { data: RevenueInMonth[] } = $props();

	// The chart's scale keys its bars by value: the months as text (`yyyy-mm-dd`, their first days).
	const bars = $derived(data.map((month) => ({ ...month, month: month.month.toString() })));
	const first = (month: string) => Temporal.PlainDate.from(month);

	const tick = dateFormatter({ month: "short" });
	/** Short amounts for the axis, e.g. `€12K`. */
	const compactEuros = numberFormatter({
		style: "currency",
		currency: "EUR",
		notation: "compact",
		maximumFractionDigits: 0,
	});

	const config = $derived({
		total: { label: m.dashboard_column_revenue(), color: "var(--primary)" },
	} satisfies ChartConfig);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.dashboard_revenue_per_month()}</Card.Title>
		<Card.Description>{m.dashboard_revenue_per_month_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<Chart.Container
			{config}
			class="aspect-auto h-72 w-full"
			aria-hidden="true"
			{@attach settledWidth}
		>
			<BarChart
				data={bars}
				x="month"
				series={[{ key: "total", label: config.total.label, color: config.total.color }]}
				props={{
					xAxis: { format: (month: string) => tick(first(month)), tickOcclusion: { padding: 8 } },
					yAxis: { format: (cents: number) => compactEuros(cents / 100) },
				}}
			>
				{#snippet tooltip()}
					<Chart.Tooltip
						class="min-w-44"
						labelFormatter={(month: string) => formatMonth(first(month))}
						valueFormatter={formatCents}
					/>
				{/snippet}
			</BarChart>
		</Chart.Container>
		<ChartTable
			caption={m.dashboard_revenue_per_month()}
			columns={[
				m.dashboard_column_month(),
				m.dashboard_column_revenue(),
				m.dashboard_column_completed_orders(),
			]}
			rows={data.map((month) => [
				formatMonth(month.month),
				formatCents(month.total),
				formatNumber(month.orders),
			])}
		/>
	</Card.Content>
</Card.Root>
