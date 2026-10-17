<!--
	@component
	The way to the next level: "€200,000 of €250,000 · 80%" over a bar, and "€50,000 to go to
	PLATINUM+" under it; at the top level, that it's reached. `compact` leaves out the line under it
	(in a table's cell).
-->
<script lang="ts">
	import { formatEuros } from "../display.ts";
	import type { Progress } from "../model.ts";

	let {
		revenue,
		progress,
		compact = false,
	}: { revenue: number; progress: Progress | null; compact?: boolean } = $props();
</script>

{#if progress}
	<div class="flex min-w-0 flex-col gap-1.5" data-progress>
		{#if !compact}
			<div class="text-sm font-medium">
				{m.partners_towards({ level: progress.next.level })}
			</div>
		{/if}
		<div
			class="flex items-baseline justify-between gap-2 text-xs text-muted-foreground tabular-nums"
		>
			<span>
				{m.partners_progress_of({
					revenue: formatEuros(revenue),
					threshold: formatEuros(progress.next.threshold),
				})}
			</span>
			<span>{progress.percent}%</span>
		</div>
		<div
			class="h-2 overflow-hidden rounded-full bg-muted"
			role="progressbar"
			aria-label={m.partners_towards({ level: progress.next.level })}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.min(100, progress.percent)}
		>
			<div
				class="h-full rounded-full bg-primary"
				style:width="{Math.min(100, progress.percent)}%"
			></div>
		</div>
		{#if !compact}
			<div class="text-xs text-muted-foreground">
				{m.partners_progress_remaining({
					remaining: formatEuros(progress.remaining),
					level: progress.next.level,
				})}
			</div>
		{/if}
	</div>
{:else}
	<span class="text-sm text-muted-foreground">{m.partners_top_level()}</span>
{/if}
