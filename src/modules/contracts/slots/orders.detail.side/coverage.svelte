<!--
	@component
	The contracts module's card on an order's page (`orders.detail.side`, `#lib/orders/extensions.ts`):
	the contract that covered the order and its response deadline. Nothing if no contract did.
-->
<script lang="ts">
	import { refreshOnRecordChange } from "#lib/components/activity/change-feed.svelte.ts";
	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatDateTime } from "#lib/i18n/index.ts";

	import { getOrderCoverage } from "../../coverage.remote.ts";
	import { contractLevelDisplay, slaStateDisplay } from "../../display.ts";
	import ContractLink from "../../ui/contract-link.svelte";

	let { number, id }: { number: string; id: number } = $props();

	const data = $derived(await getOrderCoverage(number));
	const coverage = $derived(data.covered);
	// The order saved with other units or another type.
	refreshOnRecordChange(
		() => ({ type: "order", id }),
		() => getOrderCoverage(number).refresh(),
		// Changed since it was read: saved on its edit page, whose redirect brings it back cached.
		() => data.readAt,
	);

	// The message around the link to the contract, e.g. ["Covered by ", " (Premium)"].
	const marker = "\u0000";
	const coveredBy = (level: string) =>
		m.contracts_covered_by({ number: marker, level }).split(marker);
</script>

{#if coverage}
	{@const { contract, response } = coverage}
	{@const [before, after] = coveredBy(contractLevelDisplay[contract.level].label)}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.contracts_coverage_title()}</Card.Title>
			<Card.Description>
				{before}<ContractLink number={contract.number} />{after}
				{#if response}· {m.contracts_respond_by({ due: formatDateTime(response.due) })}{/if}
			</Card.Description>
			{#if response}
				<Card.Action>
					<EnumBadge display={slaStateDisplay} value={response.state} />
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
