<!--
	@component
	How a unit's condition went: a line of its scores over time (oldest left, 1 at the top and 6 at
	the bottom, with the thresholds as dashed lines), and each condition, newest first, with its
	score, its defects (each with its element, grade, score and photos), its advice, where it was
	recorded and by whom; one converted from before NEN 2767 says from which percentage.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatDate, formatNumber } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import { extentLabel } from "../display.ts";
	import { conditionLabels } from "../labels.ts";
	import type { ConditionSource, RecordedDefect, Thresholds } from "../model.ts";
	import { BEST_SCORE, WORST_SCORE } from "../nen2767.ts";
	import ScoreBadge from "../ui/score-badge.svelte";

	interface Condition {
		id: number;
		score: number;
		legacyPercent: number | null;
		advice: string | null;
		source: ConditionSource;
		recordedAt: Temporal.Instant;
		by: string | null;
		order: string | null;
		defects: RecordedDefect[];
	}

	let { history, thresholds }: { history: Condition[]; thresholds: Thresholds } = $props();

	const WIDTH = 240;
	const HEIGHT = 48;
	/** A score's height in the line, from the top: 1 at the top, 6 at the bottom. */
	const y = (score: number) => ((score - BEST_SCORE) / (WORST_SCORE - BEST_SCORE)) * HEIGHT;
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
			<li class="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0" data-condition-entry>
				<div class="flex items-baseline justify-between gap-3">
					<ScoreBadge score={condition.score} />
					<span class="text-xs text-muted-foreground tabular-nums">
						{formatDate(condition.recordedAt)}
					</span>
				</div>
				{#if condition.legacyPercent !== null}
					<p class="text-xs text-muted-foreground" data-converted={condition.legacyPercent}>
						{m.condition_converted_from({ percent: formatNumber(condition.legacyPercent) })}
					</p>
				{/if}
				{#if condition.defects.length}
					<ul class="flex flex-col gap-1.5" aria-label={m.condition_defects()}>
						{#each condition.defects as defect (defect.id)}
							<li class="flex flex-col gap-1 border-l-2 pl-2 text-sm" data-defect-entry>
								<div class="flex items-start justify-between gap-2">
									<span>
										{defect.description}
										{#if defect.component}
											<span class="text-muted-foreground">· {defect.component.name}</span>
										{/if}
									</span>
									<ScoreBadge score={defect.score} compact />
								</div>
								<span class="text-xs text-muted-foreground">
									{conditionLabels.label("defectSeverity", defect.severity)} · {extentLabel(
										defect.extent,
									)} · {conditionLabels.label("defectIntensity", defect.intensity)}
								</span>
								{#if defect.photos.length}
									<ul class="flex flex-wrap gap-1.5">
										{#each defect.photos as photo, index (photo.id)}
											{@const src = resolve("/(field)/(modules)/condition/photos/[id]", {
												id: String(photo.id),
											})}
											<li>
												<a
													href={src}
													target="_blank"
													rel="noopener"
													class="block overflow-hidden rounded-md border bg-muted"
													aria-label={m.condition_photo_open({ number: formatNumber(index + 1) })}
												>
													<img
														{src}
														alt={m.condition_photo_alt({ number: formatNumber(index + 1) })}
														loading="lazy"
														class="size-12 object-cover"
														data-defect-photo={photo.id}
													/>
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
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
