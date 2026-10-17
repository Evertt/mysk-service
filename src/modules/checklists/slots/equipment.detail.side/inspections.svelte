<!--
	@component
	The checklists module's card of a unit's inspections and maintenance (`equipment.detail.side`):
	its inspection status by its latest completed inspection, and its checklists per year, newest
	first (date, kind, engineer, outcome), each opening its points and remarks.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { getTimeZone } from "#lib/dates.ts";
	import { formatDate } from "#lib/i18n/index.ts";

	import { getUnitChecklists } from "../../checklists.remote.ts";
	import ChecklistPoints from "../../detail/checklist-points.svelte";
	import { checklistLabels } from "../../labels.ts";
	import InspectionBadge from "../../ui/inspection-badge.svelte";
	import OutcomeBadge from "../../ui/outcome-badge.svelte";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getUnitChecklists(serialNumber));
	const years = $derived([
		...Map.groupBy(
			data.checklists,
			(checklist) => checklist.date.toZonedDateTimeISO(getTimeZone()).year,
		),
	]);

	let openId = $state<number>();
	const opened = $derived(data.checklists.find((checklist) => checklist.id === openId));
</script>

<Card.Root data-unit-inspections>
	<Card.Header>
		<Card.Title>{m.checklists_unit_title()}</Card.Title>
		<Card.Description>
			{#if data.validUntil && data.status !== "expired"}
				{m.checklists_valid_until({ date: formatDate(data.validUntil) })}
			{:else if data.validUntil}
				{m.checklists_expired_on({ date: formatDate(data.validUntil) })}
			{:else}
				{m.checklists_unit_no_inspection()}
			{/if}
		</Card.Description>
		<Card.Action>
			<InspectionBadge status={data.status} />
		</Card.Action>
	</Card.Header>
	{#if years.length}
		<Card.Content class="flex flex-col gap-4">
			{#each years as [year, checklists] (year)}
				<section class="flex flex-col gap-1" data-year={year}>
					<h3 class="text-xs font-medium text-muted-foreground tabular-nums">{year}</h3>
					<ul class="flex flex-col divide-y rounded-md border">
						{#each checklists as checklist (checklist.id)}
							<li>
								<button
									type="button"
									class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
									data-history={checklist.order.number}
									onclick={() => (openId = checklist.id)}
								>
									<span class="flex min-w-0 flex-col">
										<span class="font-medium">
											{checklistLabels.label("checklistKind", checklist.kind)}
											<span class="font-normal text-muted-foreground tabular-nums">
												· {formatDate(checklist.date)}
											</span>
										</span>
										<span class="truncate text-xs text-muted-foreground">
											{checklist.engineer ?? checklist.order.number}
										</span>
									</span>
									<OutcomeBadge {checklist} />
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</Card.Content>
	{/if}
</Card.Root>

<Dialog.Root bind:open={() => openId !== undefined, (open) => !open && (openId = undefined)}>
	<Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
		{#if opened}
			<Dialog.Header>
				<Dialog.Title>
					{checklistLabels.label("checklistKind", opened.kind)} · {formatDate(opened.date)}
				</Dialog.Title>
				<Dialog.Description>
					{opened.name}{opened.norm ? ` · ${opened.norm}` : ""} ·
					<a
						class="underline-offset-4 hover:underline"
						href={resolve("/(app)/orders/[number]", { number: opened.order.number })}
					>
						{opened.order.number}
					</a>
				</Dialog.Description>
			</Dialog.Header>
			<div class="flex items-center gap-2 text-sm">
				<OutcomeBadge checklist={opened} />
				{#if opened.engineer}
					<span class="text-muted-foreground">{opened.engineer}</span>
				{/if}
			</div>
			<ChecklistPoints results={opened.results} remarks={opened.remarks} />
		{/if}
	</Dialog.Content>
</Dialog.Root>
