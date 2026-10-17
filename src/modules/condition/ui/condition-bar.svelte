<!--
	@component
	A unit's condition as a bar with its percentage, coloured by its band (`scoreBand()`): below the
	critical threshold rose, below the attention one amber, else emerald. A dash without one.
-->
<script lang="ts">
	import { formatNumber } from "#lib/i18n/index.ts";

	import { bandColours, bandText } from "../display.ts";
	import type { ScoreBand } from "../model.ts";

	let { score, band }: { score: number | null; band: ScoreBand | null } = $props();
</script>

{#if score !== null && band}
	<span class="inline-flex min-w-28 items-center gap-2" data-condition={score} data-band={band}>
		<span
			class="h-2 w-16 overflow-hidden rounded-full bg-muted"
			role="meter"
			aria-label={m.condition_column_condition()}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={score}
		>
			<span class={["block h-full rounded-full", bandColours[band]]} style:width="{score}%"></span>
		</span>
		<span class={["text-sm font-medium tabular-nums", bandText[band]]}>
			{formatNumber(score)}%
		</span>
	</span>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
