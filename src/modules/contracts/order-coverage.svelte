<!--
	@component
	The contracts module's card on an order's page (the `order` slot in `#lib/modules.ts`): the
	contract that covered the order and its response deadline. Nothing if no contract did.
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import { formatDateTime } from "#lib/format.ts";

	import ContractLink from "./contract-link.svelte";
	import { getOrderCoverage } from "./coverage.remote.ts";
	import { levels } from "./display.ts";
	import SlaBadge from "./sla-badge.svelte";

	let { number }: { number: string } = $props();

	const coverage = $derived(await getOrderCoverage(number));

	// The message around the link to the contract, e.g. ["Covered by ", " (Premium)"].
	const marker = "\u0000";
	const coveredBy = (level: string) =>
		m.contracts_covered_by({ number: marker, level }).split(marker);
</script>

{#if coverage}
	{@const { contract, response } = coverage}
	{@const [before, after] = coveredBy(levels[contract.level].label)}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.contracts_coverage_title()}</Card.Title>
			<Card.Description>
				{before}<ContractLink number={contract.number} />{after}
				{#if response}· {m.contracts_respond_by({ due: formatDateTime(response.due) })}{/if}
			</Card.Description>
			{#if response}
				<Card.Action>
					<SlaBadge state={response.state} />
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content>
			<dl class="grid grid-cols-2 gap-4">
				<DetailItem
					label={m.contracts_response_time()}
					value={m.contracts_within_hours({ count: contract.responseHours })}
				/>
				<DetailItem label={m.contracts_included()} value={coverage.included} />
			</dl>
		</Card.Content>
	</Card.Root>
{/if}
