<!--
	@component
	Other orders for the same units as an order (any of them), for context.
-->
<script lang="ts">
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatDate, formatNumber } from "#lib/i18n/index.ts";

	import { orderStatusDisplay } from "../display.ts";
	import type { getOrderHistory } from "../order.remote.ts";
	import OrderLink from "../ui/order-link.svelte";
	import TypeLabel from "../ui/type-label.svelte";

	let {
		units,
		history,
	}: {
		/** The order's units: at least one. */
		units: readonly { serialNumber: string }[];
		history: Awaited<ReturnType<typeof getOrderHistory>>;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.orders_history()}</Card.Title>
		<Card.Description>
			{units.length === 1
				? m.orders_history_description({ serial: units[0].serialNumber })
				: m.orders_history_units_description({ count: formatNumber(units.length) })}
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
							<Table.Cell
								><EnumBadge display={orderStatusDisplay} value={other.status} /></Table.Cell
							>
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
					<Empty.Description>
						{units.length === 1
							? m.orders_history_empty_description()
							: m.orders_history_empty_units_description()}
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
