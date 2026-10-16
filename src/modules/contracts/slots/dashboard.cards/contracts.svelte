<!--
	@component
	The contracts module's cards on the dashboard (`dashboard.cards`, `#lib/dashboard/extensions.ts`):
	call-outs whose response time is at risk or overdue, and contracts about to end.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { squeeze } from "#lib/components/squeeze.ts";
	import { CustomerLink } from "#lib/customers/components.ts";
	import { formatDate, formatDateTime, formatNumber } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import { getContractsOverview } from "../../coverage.remote.ts";
	import ContractLink from "../../ui/contract-link.svelte";
	import LevelBadge from "../../ui/level-badge.svelte";
	import SlaBadge from "../../ui/sla-badge.svelte";

	const data = $derived(await getContractsOverview());
	const days = $derived(formatNumber(data.days));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.contracts_dashboard_responses()}</Card.Title>
		<Card.Description>{m.contracts_dashboard_responses_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="@container">
		{#if data.responses.length}
			<!-- A little tighter where the column is cramped, before it scrolls. -->
			<Table.Root {@attach squeeze({ within: "[data-slot=table-container]", min: 0.88 })}>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.contracts_order()}</Table.Head>
						<Table.Head class="text-right">{m.contracts_dashboard_respond_by()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.responses as order (order.id)}
						<Table.Row>
							<Table.Cell>
								<div class="flex flex-col">
									<OrderLink number={order.number} />
									<span class="w-0 min-w-full truncate text-xs text-muted-foreground">
										{order.customer.name}
									</span>
								</div>
							</Table.Cell>
							<!-- The state under the time, so the card fits a narrow column. -->
							<Table.Cell class="text-right">
								<div class="flex flex-col items-end gap-1">
									<span class="tabular-nums">{formatDateTime(order.response.due)}</span>
									<SlaBadge state={order.response.state} />
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.contracts_dashboard_on_track_title()}</Empty.Title>
					<Empty.Description>{m.contracts_dashboard_on_track_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.contracts_dashboard_expiring()}</Card.Title>
		<Card.Description>{m.contracts_dashboard_expiring_description({ days })}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" href={resolve("/(app)/(modules)/contracts")}>
				{m.contracts_dashboard_all()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content class="@container">
		{#if data.expiring.length}
			<!-- A little tighter where the column is cramped, before it scrolls. -->
			<Table.Root {@attach squeeze({ within: "[data-slot=table-container]", min: 0.88 })}>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.contracts_contract()}</Table.Head>
						<!-- Left out where the card is narrow (a phone). -->
						<Table.Head class="hidden @xs:table-cell">{m.contracts_level()}</Table.Head>
						<Table.Head class="text-right">{m.contracts_ends_on()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.expiring as contract (contract.id)}
						<Table.Row>
							<!-- The customer under the contract, so the card fits a narrow column. -->
							<Table.Cell>
								<div class="flex flex-col">
									<ContractLink number={contract.number} />
									<span class="w-0 min-w-full truncate text-xs">
										<CustomerLink code={contract.customer.code} name={contract.customer.name} />
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="hidden @xs:table-cell"
								><LevelBadge level={contract.level} /></Table.Cell
							>
							<Table.Cell class="text-right tabular-nums">{formatDate(contract.endsOn)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.contracts_dashboard_none_expiring_title()}</Empty.Title>
					<Empty.Description
						>{m.contracts_dashboard_none_expiring_description({ days })}</Empty.Description
					>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
