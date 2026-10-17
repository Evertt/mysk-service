<!--
	@component
	The consumption chart of the site's page, after the mockup: per hour (a day) or per day (a
	month), the previous period's bar ("Vergelijking") beside this one's, which is filled as far as
	it's measured ("Gemeten"); the rest of the period is outlined dashed at what it's likely to come
	to ("Nog te meten", `consumptionBars()`), and the bucket being measured now is filled amber. Under
	it the period's consumption so far, the previous period's to the same moment, and the
	difference. The same numbers in a visually hidden table for screen readers.
-->
<script lang="ts">
	import TrendingDownIcon from "@lucide/svelte/icons/trending-down";
	import TrendingUpIcon from "@lucide/svelte/icons/trending-up";

	import { changeClass, formatChange, formatKwh } from "../display.ts";
	import type { ConsumptionBar } from "./scope.ts";

	let {
		title,
		description,
		bars,
		bucket,
		current,
		previous,
		change,
	}: {
		title: string;
		description?: string;
		bars: ConsumptionBar[];
		/** Hours of a day (0–23) or days (1, 2, …). */
		bucket: "hour" | "day";
		/** kWh so far, and the previous period's to the same moment. */
		current: number;
		previous: number;
		/** In percent, or null without a previous period. */
		change: number | null;
	} = $props();

	const max = $derived(Math.max(1, ...bars.flatMap((bar) => [bar.expected, bar.previous])));
	/** A bar's height in percent, at least a sliver for anything above 0. */
	const height = (kwh: number) => (kwh > 0 ? Math.max(1.5, (kwh / max) * 100) : 0);
	/** A bucket's label: `08`, or the day's number. */
	const labelOf = (index: number) =>
		bucket === "hour" ? String(index).padStart(2, "0") : String(index + 1);
	const fullLabel = (index: number) =>
		bucket === "hour" ? `${String(index).padStart(2, "0")}:00` : String(index + 1);
	const Trend = $derived(change !== null && change < 0 ? TrendingDownIcon : TrendingUpIcon);
</script>

<Card.Root data-energy-chart data-consumption-chart>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		{#if description}<Card.Description>{description}</Card.Description>{/if}
		<Card.Action>
			<ul class="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
				<li class="inline-flex items-center gap-1">
					<span class="size-2 bg-primary" aria-hidden="true"></span>{m.energy_chart_measured()}
				</li>
				<li class="inline-flex items-center gap-1">
					<span class="size-2 border border-dashed border-primary bg-primary/10" aria-hidden="true"
					></span>{m.energy_chart_remaining()}
				</li>
				<li class="inline-flex items-center gap-1">
					<span class="size-2 bg-slate-300 dark:bg-slate-600" aria-hidden="true"
					></span>{m.energy_chart_comparison()}
				</li>
			</ul>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<div class="flex h-52 items-end gap-0.5 pb-4 sm:gap-1" aria-hidden="true">
			{#each bars as bar, index (index)}
				<div
					class="relative flex h-full flex-1 items-end"
					title={m.energy_chart_bar({
						bucket: fullLabel(index),
						measured: formatKwh(bar.measured),
						expected: formatKwh(bar.expected),
						previous: formatKwh(bar.previous),
					})}
					data-bar={index}
					data-bar-state={bar.state}
				>
					<div
						class="grow-bar absolute bottom-0 left-0 w-1/2 rounded-t-sm bg-slate-300 dark:bg-slate-600"
						style:height="{height(bar.previous)}%"
					></div>
					<div
						class={[
							"grow-bar absolute right-0 bottom-0 w-1/2 overflow-hidden rounded-t-sm border bg-primary/10",
							bar.state === "measured" ? "border-transparent" : "border-dashed border-primary/60",
						]}
						style:height="{height(bar.expected)}%"
					>
						<div
							class={[
								"grow-bar absolute inset-x-0 bottom-0",
								bar.state === "current" ? "bg-amber-500" : "bg-primary",
							]}
							style:height="{bar.expected > 0 ? (bar.measured / bar.expected) * 100 : 0}%"
						></div>
					</div>
					{#if index % 3 === 0}
						<span class="absolute -bottom-4 left-0 text-[0.5rem] text-muted-foreground"
							>{labelOf(index)}</span
						>
					{/if}
				</div>
			{/each}
		</div>
		<div class="sr-only">
			<table>
				<caption>{title}</caption>
				<thead>
					<tr>
						<th scope="col">{bucket === "hour" ? m.energy_chart_hour() : m.energy_chart_day()}</th>
						<th scope="col">{m.energy_chart_measured()}</th>
						<th scope="col">{m.energy_chart_expected()}</th>
						<th scope="col">{m.energy_chart_comparison()}</th>
					</tr>
				</thead>
				<tbody>
					{#each bars as bar, index (index)}
						<tr>
							<th scope="row">{fullLabel(index)}</th>
							<td>{bar.state === "remaining" ? "—" : formatKwh(bar.measured)}</td>
							<td>{formatKwh(bar.expected)}</td>
							<td>{formatKwh(bar.previous)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<dl class="mt-3 grid grid-cols-3 gap-3 border-t pt-3 text-xs" data-chart-totals>
			<div>
				<dt class="text-muted-foreground">{m.energy_chart_current()}</dt>
				<dd class="font-semibold tabular-nums" data-total="current">{formatKwh(current)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">{m.energy_chart_comparison()}</dt>
				<dd class="font-semibold tabular-nums" data-total="previous">{formatKwh(previous)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">{m.energy_chart_difference()}</dt>
				<dd
					class={["inline-flex items-center gap-1 font-semibold tabular-nums", changeClass(change)]}
					data-total="change"
				>
					{#if change !== null}<Trend class="size-3 shrink-0" aria-hidden="true" />{/if}
					{formatChange(change)}
				</dd>
			</div>
		</dl>
	</Card.Content>
</Card.Root>

<style>
	.grow-bar {
		transition: height 500ms ease-out;
	}
	@media (prefers-reduced-motion: reduce) {
		.grow-bar {
			transition: none;
		}
	}
</style>
