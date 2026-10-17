<!--
	@component
	The checklists module's card on a unit's page in the customer portal (`client.unit`,
	`#lib/client/extensions.ts`): its inspection status by its latest completed inspection, until
	when it's valid, and its completed checklists, newest first.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatDate } from "#lib/i18n/index.ts";

	import { getClientUnitInspection } from "../../client/client-checklists.remote.ts";
	import { checklistLabels } from "../../labels.ts";
	import InspectionBadge from "../../ui/inspection-badge.svelte";
	import OutcomeBadge from "../../ui/outcome-badge.svelte";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getClientUnitInspection(serialNumber));
	const completed = $derived(
		data.checklists.filter((checklist) => checklist.status === "completed").slice(0, 10),
	);
</script>

<Card.Root data-client-inspection>
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
	{#if completed.length}
		<Card.Content>
			<ul class="flex flex-col divide-y rounded-md border">
				{#each completed as checklist (checklist.id)}
					<li>
						<a
							href={resolve("/(customer)/portal/orders/[number]", {
								number: checklist.order.number,
							})}
							class="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50"
							data-history={checklist.order.number}
						>
							<span class="flex min-w-0 flex-col">
								<span class="font-medium">
									{checklistLabels.label("checklistKind", checklist.kind)}
									<span class="font-normal text-muted-foreground tabular-nums">
										· {formatDate(checklist.date)}
									</span>
								</span>
								<span class="truncate text-xs text-muted-foreground">{checklist.name}</span>
							</span>
							<OutcomeBadge {checklist} />
						</a>
					</li>
				{/each}
			</ul>
		</Card.Content>
	{/if}
</Card.Root>
