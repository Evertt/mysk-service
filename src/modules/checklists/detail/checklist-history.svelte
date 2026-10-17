<!--
	@component
	A unit's checklists per year, newest first ("Historie per jaar"): each with its kind and date, who
	completed it (or its order) and its outcome. Each opens: a link where the page shows a checklist
	itself (`href`, the work orders page), else a button (`onopen`, the unit's page opens a dialog).
-->
<script lang="ts">
	import { getTimeZone } from "#lib/dates.ts";
	import { formatDate } from "#lib/i18n/index.ts";

	import { completerName } from "../display.ts";
	import { checklistLabels } from "../labels.ts";
	import type { ChecklistKind, ChecklistStatus, PointResult } from "../model.ts";
	import OutcomeBadge from "../ui/outcome-badge.svelte";

	interface Entry {
		id: number;
		kind: ChecklistKind;
		status: ChecklistStatus;
		date: Temporal.Instant;
		engineer: string | null;
		office: string | null;
		order: { number: string };
		results: readonly { result: PointResult | null }[];
	}

	let {
		checklists,
		current,
		href,
		onopen,
	}: {
		/** Newest first. */
		checklists: readonly Entry[];
		/** The one shown beside it, if any. */
		current?: number;
		href?: (checklist: Entry) => string;
		onopen?: (checklist: Entry) => void;
	} = $props();

	const years = $derived([
		...Map.groupBy(
			checklists,
			(checklist) => checklist.date.toZonedDateTimeISO(getTimeZone()).year,
		),
	]);
	const itemClass =
		"flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 aria-[current=true]:bg-primary/10";
</script>

<div class="flex flex-col gap-4" data-checklist-history>
	{#each years as [year, entries] (year)}
		<section class="flex flex-col gap-1" data-year={year}>
			<h3 class="text-xs font-medium text-muted-foreground tabular-nums">{year}</h3>
			<ul class="flex flex-col divide-y rounded-md border">
				{#each entries as checklist (checklist.id)}
					<li>
						{#snippet content()}
							<span class="flex min-w-0 flex-col">
								<span class="font-medium">
									{checklistLabels.label("checklistKind", checklist.kind)}
									<span class="font-normal text-muted-foreground tabular-nums">
										· {formatDate(checklist.date)}
									</span>
								</span>
								<span class="truncate text-xs text-muted-foreground">
									{completerName(checklist) ?? checklist.order.number}
								</span>
							</span>
							<OutcomeBadge {checklist} />
						{/snippet}
						{#if href}
							<a
								class={itemClass}
								href={href(checklist)}
								aria-current={checklist.id === current ? "true" : undefined}
								data-sveltekit-reset="false"
								data-history={checklist.order.number}
							>
								{@render content()}
							</a>
						{:else}
							<button
								type="button"
								class={itemClass}
								data-history={checklist.order.number}
								onclick={() => onopen?.(checklist)}
							>
								{@render content()}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
