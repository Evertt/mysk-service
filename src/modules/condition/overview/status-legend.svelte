<!--
	@component
	"What do the statuses mean?": each status with what it means and asks for, by the tenant's
	thresholds, and NEN 2767's condition scale, each score with what it means. Folded away until asked
	for, so the list below stays in view.
-->
<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	import { scoreDescription, statusMeaning } from "../display.ts";
	import { type Thresholds, unitStatuses } from "../model.ts";
	import { conditionScores } from "../nen2767.ts";
	import ScoreBadge from "../ui/score-badge.svelte";
	import StatusBadge from "../ui/status-badge.svelte";

	let { thresholds }: { thresholds: Thresholds } = $props();
</script>

<details class="group rounded-lg border px-4 py-3" data-status-legend>
	<summary class="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
		<ChevronRightIcon class="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
		{m.condition_legend_title()}
	</summary>
	<dl class="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		{#each unitStatuses as status (status)}
			<div class="flex flex-col items-start gap-1">
				<dt><StatusBadge {status} /></dt>
				<dd class="text-sm text-muted-foreground">{statusMeaning(status, thresholds)}</dd>
			</div>
		{/each}
	</dl>
	<h3 class="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
		{m.condition_legend_scale()}
	</h3>
	<dl class="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-score-legend>
		{#each conditionScores as score (score)}
			<div class="flex flex-col items-start gap-1">
				<dt><ScoreBadge {score} /></dt>
				<dd class="text-sm text-muted-foreground">{scoreDescription(score)}</dd>
			</div>
		{/each}
	</dl>
	<p class="mt-3 text-xs text-muted-foreground">{m.condition_legend_scale_note()}</p>
</details>
