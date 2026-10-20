<!--
	@component
	The contracts module's card on a unit of equipment's page (`equipment.detail.side`,
	`#lib/equipment/extensions.ts`): the contracts covering the unit, with their level and end date.
-->
<script lang="ts">
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatDate } from "#lib/i18n/index.ts";

	import { getUnitCoverage } from "../../coverage.remote.ts";
	import { contractLevelDisplay, contractStatusDisplay } from "../../display.ts";
	import { contractStatus } from "../../model.ts";
	import ContractLink from "../../ui/contract-link.svelte";

	let { serialNumber }: { serialNumber: string } = $props();

	const contracts = $derived(await getUnitCoverage(serialNumber));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.contracts_title()}</Card.Title>
		<Card.Description>{m.contracts_unit_coverage_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if contracts.length}
			<ul class="flex flex-col divide-y">
				{#each contracts as contract (contract.id)}
					<li class="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
						<div class="flex flex-col items-start gap-1.5">
							<ContractLink number={contract.number} />
							<div class="flex flex-wrap gap-1">
								<EnumBadge display={contractStatusDisplay} value={contractStatus(contract)} />
								<EnumBadge display={contractLevelDisplay} value={contract.level} />
							</div>
						</div>
						<dl class="flex flex-col items-end gap-0.5 text-right">
							<dt class="text-xs text-muted-foreground">{m.contracts_ends_on()}</dt>
							<dd class="text-sm tabular-nums">{formatDate(contract.endsOn)}</dd>
						</dl>
					</li>
				{/each}
			</ul>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.contracts_unit_not_covered_title()}</Empty.Title>
					<Empty.Description>{m.contracts_unit_not_covered_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
