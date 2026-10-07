<!--
	@component
	The contracts module's cards on the dashboard (the `dashboard` slot in `#lib/modules.ts`): call-outs
	whose response time is at risk or overdue, and contracts about to end.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import CustomerLink from "#lib/components/customers/customer-link.svelte";
	import OrderLink from "#lib/components/orders/order-link.svelte";
	import { formatDate, formatDateTime } from "#lib/format.js";

	import ContractLink from "./contract-link.svelte";
	import { getContractsOverview } from "./coverage.remote.js";
	import LevelBadge from "./level-badge.svelte";
	import SlaBadge from "./sla-badge.svelte";

	const data = $derived(await getContractsOverview());
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Response times at risk</Card.Title>
		<Card.Description>Covered call-outs not yet scheduled, most urgent first.</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if data.responses.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Order</Table.Head>
						<Table.Head>Respond by</Table.Head>
						<Table.Head class="text-right">Status</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.responses as order (order.id)}
						<Table.Row>
							<Table.Cell>
								<div class="flex flex-col">
									<OrderLink number={order.number} />
									<span class="max-w-48 truncate text-xs text-muted-foreground">
										{order.customer.name}
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="tabular-nums">{formatDateTime(order.response.due)}</Table.Cell>
							<Table.Cell class="text-right"><SlaBadge state={order.response.state} /></Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>All on track</Empty.Title>
					<Empty.Description>No covered call-out is about to miss its deadline.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Contracts ending soon</Card.Title>
		<Card.Description>Ending in the next 60 days, not yet renewed.</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" href={resolve("/(app)/contracts")}>All contracts</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if data.expiring.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Contract</Table.Head>
						<Table.Head>Customer</Table.Head>
						<Table.Head>Level</Table.Head>
						<Table.Head class="text-right">Ends on</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.expiring as contract (contract.id)}
						<Table.Row>
							<Table.Cell><ContractLink number={contract.number} /></Table.Cell>
							<Table.Cell>
								<CustomerLink code={contract.customer.code} name={contract.customer.name} />
							</Table.Cell>
							<Table.Cell><LevelBadge level={contract.level} /></Table.Cell>
							<Table.Cell class="text-right tabular-nums">{formatDate(contract.endsOn)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>Nothing ending soon</Empty.Title>
					<Empty.Description>No active contract ends in the next 60 days.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
