<!--
	@component
	kWh per hour (a day) or per day (a month, a report): the period's bars beside the previous
	period's, in the app's chart colours (light and dark), with the same numbers in a visually hidden
	table for screen readers.
-->
<script lang="ts">
	import { BarChart } from "layerchart";

	import type { ChartConfig } from "#lib/components/ui/chart/index.ts";

	import { formatKwh } from "../display.ts";

	let {
		title,
		description,
		current,
		previous,
		bucket,
		currentLabel,
		previousLabel,
	}: {
		title: string;
		description?: string;
		/** kWh per bucket, now and in the previous period. */
		current: number[];
		previous: number[];
		/** Hours of a day (0–23) or days (1, 2, …). */
		bucket: "hour" | "day";
		currentLabel: string;
		previousLabel: string;
	} = $props();

	const config = $derived({
		current: { label: currentLabel, color: "var(--chart-1)" },
		previous: { label: previousLabel, color: "var(--chart-3)" },
	} satisfies ChartConfig);

	/** A bucket's label: `08:00`, or the day's number. */
	const labelOf = (index: number) =>
		bucket === "hour" ? `${String(index).padStart(2, "0")}:00` : String(index + 1);

	const rows = $derived(
		Array.from({ length: Math.max(current.length, previous.length) }, (_, i) => ({
			bucket: labelOf(i),
			current: Math.round((current[i] ?? 0) * 10) / 10,
			previous: Math.round((previous[i] ?? 0) * 10) / 10,
		})),
	);
	const series = $derived([
		{ key: "previous", label: config.previous.label, color: config.previous.color },
		{ key: "current", label: config.current.label, color: config.current.color },
	]);
	/** Every n-th label, so they sit at least 44px apart. */
	const ticks = (scale: unknown) => {
		const band = scale as { domain(): string[]; step(): number };
		const all = band.domain();
		const every = Math.max(1, Math.ceil(44 / band.step()));
		return all.filter((_, i) => i % every === 0);
	};
</script>

<Card.Root data-energy-chart>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		{#if description}<Card.Description>{description}</Card.Description>{/if}
	</Card.Header>
	<Card.Content>
		<div class="flex flex-col gap-3" aria-hidden="true">
			<Chart.Container {config} class="aspect-auto h-56 w-full">
				<BarChart
					data={rows}
					x="bucket"
					{series}
					seriesLayout="group"
					props={{
						xAxis: { ticks, tickOcclusion: { padding: 6 } },
						yAxis: { format: (value: number) => String(Math.round(value)) },
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip />
					{/snippet}
				</BarChart>
			</Chart.Container>
			<ul class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
				{#each series as { key, label, color } (key)}
					<li class="flex items-center gap-1.5">
						<span class="size-2.5 shrink-0 rounded-[2px]" style:background-color={color}></span>
						{label}
					</li>
				{/each}
			</ul>
		</div>
		<div class="sr-only">
			<table>
				<caption>{title}</caption>
				<thead>
					<tr>
						<th scope="col">{bucket === "hour" ? m.energy_chart_hour() : m.energy_chart_day()}</th>
						<th scope="col">{currentLabel}</th>
						<th scope="col">{previousLabel}</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.bucket)}
						<tr>
							<th scope="row">{row.bucket}</th>
							<td>{formatKwh(row.current)}</td>
							<td>{formatKwh(row.previous)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Card.Content>
</Card.Root>
