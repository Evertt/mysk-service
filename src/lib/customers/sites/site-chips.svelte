<!--
	@component
	A site's chips: its figures that ask to be seen while they aren't zero (`chipsOf()`), the worst
	first, each a badge in its tone with its label and value; or, without any, `empty` if given. Each
	chip has its figure's id as `data-figure`, for tests.
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	import type { SiteFigure } from "../extensions.ts";
	import { chipsOf, figureValue } from "./figures.ts";

	let { figures, empty }: { figures: readonly SiteFigure[]; empty?: Snippet } = $props();

	const chips = $derived(chipsOf(figures));
</script>

{#if chips.length}
	<ul class="flex flex-wrap gap-1.5">
		{#each chips as chip (chip.id)}
			<li>
				<Badge variant={chip.chip} class="h-auto py-1 whitespace-normal" data-figure={chip.id}>
					<span class="font-semibold tabular-nums">{figureValue(chip)}</span>
					{chip.label}
				</Badge>
			</li>
		{/each}
	</ul>
{:else}
	{@render empty?.()}
{/if}
