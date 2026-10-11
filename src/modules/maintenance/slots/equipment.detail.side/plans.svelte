<!--
	@component
	The maintenance module's card on a unit of equipment's page (`equipment.detail.side`,
	`#lib/equipment/extensions.ts`): the unit's plans, with their interval, next visit and last
	order, to add, edit, pause and delete.
-->
<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PlanRow from "../../detail/plan-row.svelte";
	import PlanDialog from "../../form/plan-dialog.svelte";
	import { getUnitPlans } from "../../plans.remote.ts";

	let { serialNumber }: { serialNumber: string } = $props();

	const data = $derived(await getUnitPlans(serialNumber));
	let adding = $state(false);
</script>

<Card.Root data-maintenance-plans>
	<Card.Header>
		<Card.Title>{m.maintenance_card_title()}</Card.Title>
		<Card.Description>{m.maintenance_card_description()}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" onclick={() => (adding = true)}>
				<PlusIcon data-icon="inline-start" />
				{m.maintenance_add()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if data.plans.length}
			<ul class="flex flex-col divide-y">
				{#each data.plans as plan (plan.id)}
					<PlanRow {plan} equipmentId={data.unit.id} />
				{/each}
			</ul>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.maintenance_card_empty_title()}</Empty.Title>
					<Empty.Description>{m.maintenance_card_empty_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>

<PlanDialog equipmentId={data.unit.id} bind:open={adding} />
