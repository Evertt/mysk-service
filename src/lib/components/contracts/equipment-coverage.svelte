<!--
	@component
	The contracts module's card on a unit of equipment's page (the `equipment` slot in
	`#lib/modules.ts`): the contracts covering the unit, with their level and end date.
-->
<script lang="ts">
	import { formatDate } from "#lib/format.js";
	import { contractStatus } from "#lib/models.js";

	import ContractLink from "./contract-link.svelte";
	import { getUnitCoverage } from "./coverage.remote.js";
	import LevelBadge from "./level-badge.svelte";
	import ContractStatusBadge from "./status-badge.svelte";

	let { serialNumber }: { serialNumber: string } = $props();

	const contracts = $derived(await getUnitCoverage(serialNumber));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Service contracts</Card.Title>
		<Card.Description>The contracts covering this unit, latest first.</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if contracts.length}
			<ul class="flex flex-col divide-y">
				{#each contracts as contract (contract.id)}
					<li class="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
						<div class="flex flex-col items-start gap-1.5">
							<ContractLink number={contract.number} />
							<div class="flex flex-wrap gap-1">
								<ContractStatusBadge status={contractStatus(contract)} />
								<LevelBadge level={contract.level} />
							</div>
						</div>
						<dl class="flex flex-col items-end gap-0.5 text-right">
							<dt class="text-xs text-muted-foreground">Ends on</dt>
							<dd class="text-sm tabular-nums">{formatDate(contract.endsOn)}</dd>
						</dl>
					</li>
				{/each}
			</ul>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>Not covered</Empty.Title>
					<Empty.Description>No service contract covers this unit.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
