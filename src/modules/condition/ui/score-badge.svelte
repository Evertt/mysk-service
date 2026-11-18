<!--
	@component
	A condition's score on NEN 2767's scale: a tile with its number in its colour (1–3 greens and
	teal, 4 amber, 5 orange, 6 red, `scoreColours`) and its name beside it ("3 Redelijk"), with what
	it means as its title. `compact` leaves the name out. A dash without one.
-->
<script lang="ts">
	import { formatNumber } from "#lib/i18n/index.ts";

	import { scoreColours, scoreDescription, scoreLabel } from "../display.ts";
	import { type ConditionScore, isConditionScore } from "../nen2767.ts";

	let {
		score,
		compact = false,
		class: className,
	}: { score: number | null; compact?: boolean; class?: string } = $props();
</script>

{#if score !== null && isConditionScore(score)}
	<span
		class={["inline-flex items-center gap-1.5", className]}
		title={scoreDescription(score)}
		data-condition={score}
	>
		<span
			class={[
				"inline-flex size-5 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
				scoreColours[score as ConditionScore],
			]}
		>
			{formatNumber(score)}
		</span>
		<span class={compact ? "sr-only" : "text-sm font-medium whitespace-nowrap"}>
			{scoreLabel(score)}
		</span>
	</span>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
