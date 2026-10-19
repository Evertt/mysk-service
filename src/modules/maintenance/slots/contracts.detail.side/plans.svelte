<!--
	@component
	The maintenance module's card on a contract's page (`contracts.detail.side`, contracts'
	`api/extensions.ts`; maintenance enhances contracts): the plans of the units the contract covers,
	and a plan for each of those without one in one go. The units come from the slot's props, never
	from contracts' tables; nothing shows for a contract that covers none.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { EquipmentLink } from "#lib/equipment/components.ts";

	import CoveredPlansDialog from "../../form/covered-plans-dialog.svelte";
	import { getCoveredPlans } from "../../plans.remote.ts";
	import NextDue from "../../ui/next-due.svelte";

	let { number, equipmentIds }: { number: string; equipmentIds: number[] } = $props();

	// Sorted, as the bulk add refreshes it with the ids it was given, sorted.
	const ids = $derived([...new Set(equipmentIds)].sort((a, b) => a - b));
	const data = $derived(await getCoveredPlans(ids));
	let adding = $state(false);
</script>

{#if ids.length}
	<Card.Root data-maintenance-contract>
		<Card.Header>
			<Card.Title>{m.maintenance_contract_title()}</Card.Title>
			<Card.Description>{m.maintenance_contract_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if data.units.length}
				<ul class="flex flex-col divide-y">
					{#each data.units as unit (unit.id)}
						{#each unit.plans as plan (plan.id)}
							<li class="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
								<div class="flex min-w-0 flex-col">
									<EquipmentLink
										serialNumber={unit.serialNumber}
										class="font-medium underline-offset-4 hover:underline"
									/>
									<span class="truncate text-sm text-muted-foreground">{plan.description}</span>
								</div>
								<span class="text-sm">
									{#if plan.paused}
										<Badge variant="secondary">{m.maintenance_paused()}</Badge>
									{:else}
										<NextDue value={plan.nextDueOn} />
									{/if}
								</span>
							</li>
						{/each}
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground">{m.maintenance_contract_empty()}</p>
			{/if}
			{#if data.without}
				<Button variant="outline" size="sm" class="self-start" onclick={() => (adding = true)}>
					<PlusIcon data-icon="inline-start" />
					{m.maintenance_contract_add()}
				</Button>
			{:else}
				<p class="text-sm text-muted-foreground">{m.maintenance_contract_all_planned()}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<CoveredPlansDialog contract={number} equipmentIds={ids} bind:open={adding} />
{/if}
