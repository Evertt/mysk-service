<!--
	@component
	The contracts module's card on an order's page (the `order` slot in `#lib/modules.ts`): the
	contract that covered the order and its response deadline. Nothing if no contract did.
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import { formatDateTime } from "#lib/format.js";

	import ContractLink from "./contract-link.svelte";
	import { getOrderCoverage } from "./coverage.remote.js";
	import { levels } from "./display.js";
	import SlaBadge from "./sla-badge.svelte";

	let { number }: { number: string } = $props();

	const coverage = $derived(await getOrderCoverage(number));
</script>

{#if coverage}
	{@const { contract, response } = coverage}
	<Card.Root>
		<Card.Header>
			<Card.Title>Service contract</Card.Title>
			<Card.Description>
				Covered by <ContractLink number={contract.number} /> ({levels[contract.level].label})
				{#if response}· respond by {formatDateTime(response.due)}{/if}
			</Card.Description>
			{#if response}
				<Card.Action>
					<SlaBadge state={response.state} />
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content>
			<dl class="grid grid-cols-2 gap-4">
				<DetailItem label="Response time" value="Within {contract.responseHours} hours" />
				<DetailItem label="Included" value={coverage.included} />
			</dl>
		</Card.Content>
	</Card.Root>
{/if}
