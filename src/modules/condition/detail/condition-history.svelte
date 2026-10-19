<!--
	@component
	How a unit's condition went: a line of its scores over time (oldest left, with the thresholds as
	dashed lines), and each condition, newest first, with its advice, where it was recorded and by
	whom.
-->
<script lang="ts">
	import { formatDate, formatNumber } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import { bandText } from "../display.ts";
	import { conditionLabels } from "../labels.ts";
	import { type ConditionSource, scoreBand, type Thresholds } from "../model.ts";

	interface Condition {
		id: number;
		score: number;
		advice: string | null;
		source: ConditionSource;
		recordedAt: Temporal.Instant;
		by: string | null;
		order: string | null;
	}

	let { history, thresholds }: { history: Condition[]; thresholds: Thresholds } = $props();

	const WIDTH = 240;
	const HEIGHT = 48;
	/** A score's height in the line, from the bottom. */
	const y = (score: number) => HEIGHT - (score / 100) * HEIGHT;
	const points = $derived.by(() => {
		const oldestFirst = history.toReversed();
		const step = oldestFirst.length > 1 ? WIDTH / (oldestFirst.length - 1) : 0;
		return oldestFirst.map((condition, i) => `${i * step},${y(condition.score)}`).join(" ");
	});
</script>

<div class="flex flex-col gap-4">
	{#if history.length > 1}
		<svg
			viewBox="0 0 {WIDTH} {HEIGHT}"
			class="h-12 w-full overflow-visible"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			{#each [thresholds.critical, thresholds.attention] as threshold (threshold)}
				<line
					x1="0"
					x2={WIDTH}
					y1={y(threshold)}
					y2={y(threshold)}
					class="stroke-muted-foreground/40"
					stroke-dasharray="3 3"
					vector-effect="non-scaling-stroke"
				/>
			{/each}
			<polyline
				{points}
				fill="none"
				class="stroke-primary"
				stroke-width="2"
				stroke-linejoin="round"
				vector-effect="non-scaling-stroke"
			/>
		</svg>
	{/if}
	<ol class="flex flex-col divide-y" data-condition-history>
		{#each history as condition (condition.id)}
			{@const band = scoreBand(condition.score, thresholds)}
			<li class="flex flex-col gap-1 py-2 first:pt-0 last:pb-0" data-condition-entry>
				<div class="flex items-baseline justify-between gap-3">
					<span class={["font-medium tabular-nums", bandText[band]]}>
						{formatNumber(condition.score)}%
					</span>
					<span class="text-xs text-muted-foreground tabular-nums">
						{formatDate(condition.recordedAt)}
					</span>
				</div>
				{#if condition.advice}
					<p class="text-sm">{condition.advice}</p>
				{/if}
				<p class="text-xs text-muted-foreground">
					{conditionLabels.label("conditionSource", condition.source)} · {condition.by ??
						m.condition_someone()}
					{#if condition.order}
						·
						<OrderLink number={condition.order} class="underline-offset-4 hover:underline" />
					{/if}
				</p>
			</li>
		{/each}
	</ol>
</div>
