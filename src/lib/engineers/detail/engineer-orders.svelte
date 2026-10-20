<!--
	@component
	A table of an engineer's orders on their page: each order (linked) with its description, its
	customer, status and a date (`dateLabel`'s, `date` of the row).
-->
<script lang="ts">
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { CustomerLink } from "#lib/customers/components.ts";
	import { formatDate } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";
	import { orderStatusDisplay } from "#lib/orders/index.ts";

	import type { getEngineerWork } from "../engineers.remote.ts";

	type OrderRow = Awaited<ReturnType<typeof getEngineerWork>>["openOrders"][number];

	let {
		rows,
		dateLabel,
		date,
	}: {
		rows: OrderRow[];
		dateLabel: string;
		date: (row: OrderRow) => Temporal.Instant | null;
	} = $props();
</script>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>{m.engineers_orders_column_order()}</Table.Head>
			<Table.Head>{m.engineers_orders_column_customer()}</Table.Head>
			<Table.Head>{m.engineers_orders_column_status()}</Table.Head>
			<Table.Head class="text-right">{dateLabel}</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each rows as row (row.id)}
			{@const value = date(row)}
			<Table.Row>
				<Table.Cell>
					<div class="flex max-w-56 flex-col">
						<OrderLink number={row.number} />
						<span class="truncate text-xs text-muted-foreground">{row.description}</span>
					</div>
				</Table.Cell>
				<Table.Cell>
					<CustomerLink code={row.customer.code} name={row.customer.name} withCode />
				</Table.Cell>
				<Table.Cell><EnumBadge display={orderStatusDisplay} value={row.status} /></Table.Cell>
				<Table.Cell class="text-right tabular-nums">
					{#if value}
						{formatDate(value)}
					{:else}
						<span class="text-muted-foreground">{m.engineers_orders_not_scheduled()}</span>
					{/if}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
