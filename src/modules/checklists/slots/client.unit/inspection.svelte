<!--
	@component
	The checklists module's card on a unit's page in the customer portal (`client.unit`,
	`#lib/client/extensions.ts`): its completed checklists, newest first, each linking to its order.
	Its inspection status and validity are its fact in the unit's card (`client.unit.facts`).
	Nothing before the first is completed.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatDate } from "#lib/i18n/index.ts";

	import { getClientUnitInspection } from "../../client/client-checklists.remote.ts";
	import { checklistLabels } from "../../labels.ts";
	import OutcomeBadge from "../../ui/outcome-badge.svelte";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getClientUnitInspection(serialNumber));
	// The query answers only the completed ones.
	const completed = $derived(data.checklists.slice(0, 10));
</script>

{#if completed.length}
	<Card.Root class="rounded-xl" data-client-inspection>
		<Card.Header>
			<Card.Title>{m.checklists_unit_title()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<ul class="flex flex-col divide-y rounded-md border">
				{#each completed as checklist (checklist.id)}
					<li>
						<a
							href={resolve("/(customer)/portal/orders/[number]", {
								number: checklist.order.number,
							})}
							class="flex min-h-14 items-center justify-between gap-2 px-3 py-2.5 text-[0.9375rem] hover:bg-muted/50"
							data-history={checklist.order.number}
						>
							<span class="flex min-w-0 flex-col">
								<span class="font-medium">
									{checklistLabels.label("checklistKind", checklist.kind)}
									<span class="font-normal text-muted-foreground tabular-nums">
										· {formatDate(checklist.date)}
									</span>
								</span>
								<span class="truncate text-[0.8125rem] text-muted-foreground">{checklist.name}</span
								>
							</span>
							<OutcomeBadge {checklist} />
						</a>
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>
{/if}
