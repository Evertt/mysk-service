<!--
	@component
	A checklist's points with what was found on each and its remark: the rejected ones first (the
	office's view, `rejectedFirst`) or under their groups' headings, in their order (the work order's).
	Then the general remark for the customer, if there is one.
-->
<script lang="ts">
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import CircleDashedIcon from "@lucide/svelte/icons/circle-dashed";
	import CircleMinusIcon from "@lucide/svelte/icons/circle-minus";
	import CircleXIcon from "@lucide/svelte/icons/circle-x";

	import { checklistLabels } from "../labels.ts";
	import { type PointResult, rejectedFirst } from "../model.ts";

	interface Point {
		id: number;
		group: string;
		text: string;
		result: PointResult | null;
		remark: string | null;
	}

	let {
		results,
		remarks = null,
		grouped = false,
	}: {
		results: readonly Point[];
		/** The general remark for the customer. */
		remarks?: string | null;
		/** Under their groups, in their order; else the rejected ones first. */
		grouped?: boolean;
	} = $props();

	const sections = $derived(
		grouped
			? [...Map.groupBy(results, (point) => point.group)].map(([group, points]) => ({
					group,
					points,
				}))
			: [{ group: "", points: rejectedFirst(results) }],
	);

	const icons = {
		ok: CircleCheckIcon,
		nok: CircleXIcon,
		na: CircleMinusIcon,
	};
</script>

<div class="flex flex-col gap-3" data-checklist-points>
	{#each sections as section (section.group)}
		<section class="flex flex-col gap-1" data-group={section.group}>
			{#if grouped && section.group}
				<h4 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{section.group}
				</h4>
			{/if}
			<ul class="flex flex-col divide-y">
				{#each section.points as point (point.id)}
					{@const Icon = point.result ? icons[point.result] : CircleDashedIcon}
					<li class="flex gap-2 py-1.5 text-sm" data-point data-result={point.result ?? "open"}>
						<Icon
							class={[
								"mt-0.5 size-4 shrink-0",
								point.result === "ok" && "text-emerald-600 dark:text-emerald-400",
								point.result === "nok" && "text-destructive",
								(!point.result || point.result === "na") && "text-muted-foreground",
							]}
							aria-hidden="true"
						/>
						<div class="flex min-w-0 flex-col">
							<span>
								<span class="sr-only">
									{point.result
										? checklistLabels.label("pointResult", point.result)
										: m.checklists_result_open()}:
								</span>
								{#if !grouped && point.group}
									<span class="text-muted-foreground">{point.group} · </span>
								{/if}
								{point.text}
							</span>
							{#if point.remark}
								<span
									class={[
										"whitespace-pre-line",
										point.result === "nok" ? "text-destructive" : "text-muted-foreground",
									]}
									data-remark
								>
									{point.remark}
								</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
	{#if remarks}
		<div class="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm" data-checklist-remarks>
			<span class="text-xs text-muted-foreground">{m.checklists_remarks()}</span>
			<p class="whitespace-pre-line">{remarks}</p>
		</div>
	{/if}
</div>
