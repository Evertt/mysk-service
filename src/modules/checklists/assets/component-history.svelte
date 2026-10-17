<!--
	@component
	A component's own history on the work orders page: its scores per year, newest first, each with
	its date and where it came from (a checklist on an order, or the office's correction).
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { getTimeZone } from "#lib/dates.ts";
	import { formatDate, formatNumber } from "#lib/i18n/index.ts";

	import { getComponentScores } from "./assets.remote.ts";

	let { serialNumber, componentId }: { serialNumber: string; componentId: number } = $props();

	const scores = $derived(await getComponentScores({ serialNumber, componentId }));
	const years = $derived([
		...Map.groupBy(scores, (score) => score.at.toZonedDateTimeISO(getTimeZone()).year),
	]);
</script>

{#if years.length}
	<div class="flex flex-col gap-4" data-component-history>
		{#each years as [year, entries] (year)}
			<section class="flex flex-col gap-1" data-year={year}>
				<h3 class="text-xs font-medium text-muted-foreground tabular-nums">{year}</h3>
				<ul class="flex flex-col divide-y rounded-md border">
					{#each entries as entry (entry.id)}
						<li class="flex items-center justify-between gap-2 px-3 py-2 text-sm" data-score-entry>
							<span class="flex min-w-0 flex-col">
								<span class="tabular-nums">{formatDate(entry.at)}</span>
								<span class="truncate text-xs text-muted-foreground">
									{#if entry.source === "office"}
										{m.checklists_score_source_office()}
									{:else if entry.order}
										<a
											class="underline-offset-4 hover:underline"
											href={resolve("/(app)/orders/[number]", { number: entry.order })}
										>
											{m.checklists_score_source_checklist({ order: entry.order })}
										</a>
									{:else}
										{m.checklists_score_source_unknown()}
									{/if}
									{#if entry.by}· {entry.by}{/if}
								</span>
							</span>
							<span class="font-semibold tabular-nums">
								{m.checklists_score({ score: formatNumber(entry.score) })}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{m.checklists_component_history_empty()}</p>
{/if}
