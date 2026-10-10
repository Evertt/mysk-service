<!--
	@component
	Other orders for the same unit as an order, for context.
-->
<script lang="ts">
	import { formatDate } from "#lib/i18n/index.ts";

	import type { getOrder } from "../order.remote.ts";
	import OrderLink from "../ui/order-link.svelte";
	import StatusBadge from "../ui/status-badge.svelte";
	import TypeLabel from "../ui/type-label.svelte";

	let {
		serialNumber,
		history,
	}: {
		serialNumber: string;
		history: Awaited<ReturnType<typeof getOrder>>["history"];
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.orders_history()}</Card.Title>
		<Card.Description>
			{m.orders_history_description({ serial: serialNumber })}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if history.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.orders_column_order()}</Table.Head>
						<Table.Head>{m.orders_column_type()}</Table.Head>
						<Table.Head>{m.orders_column_status()}</Table.Head>
						<Table.Head class="text-right">{m.orders_column_created()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each history as other (other.id)}
						<Table.Row>
							<Table.Cell>
								<OrderLink number={other.number} />
							</Table.Cell>
							<Table.Cell><TypeLabel type={other.type} /></Table.Cell>
							<Table.Cell><StatusBadge status={other.status} /></Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								{formatDate(other.createdAt)}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.orders_history_empty_title()}</Empty.Title>
					<Empty.Description>{m.orders_history_empty_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
