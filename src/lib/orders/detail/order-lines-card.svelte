<!--
	@component
	What an order costs: what the tenant's modules add to it (e.g. its materials, line by line),
	its labour, the modules' adjustments, and what it adds up to.
-->
<script lang="ts">
	import { formatCents } from "#lib/i18n/index.ts";

	import { costsLabour } from "../display.ts";
	import type { getOrder } from "../order.remote.ts";
	import CostItem from "../ui/cost-item.svelte";

	type Data = Awaited<ReturnType<typeof getOrder>>;

	let { order, totals }: { order: Data["order"]; totals: Data["totals"] } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{costsLabour(totals.costs)}</Card.Title>
		<Card.Description>{m.orders_materials_labour_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.orders_line_item()}</Table.Head>
					<Table.Head class="text-right">{m.orders_line_quantity()}</Table.Head>
					<Table.Head class="text-right">{m.orders_line_unit_price()}</Table.Head>
					<Table.Head class="text-right">{m.orders_line_amount()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each totals.costs as cost, i (i)}
					{#if cost.items}
						{#each cost.items as item (item.key)}
							<Table.Row>
								<Table.Cell>
									<CostItem {item} />
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{item.quantity}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{formatCents(item.unitPrice)}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{formatCents(item.amount)}</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={4} class="text-center text-muted-foreground">
									{cost.empty ?? cost.label}
								</Table.Cell>
							</Table.Row>
						{/each}
					{:else}
						<Table.Row>
							<Table.Cell colspan={3}>{cost.label}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{formatCents(cost.amount)}</Table.Cell>
						</Table.Row>
					{/if}
				{/each}
				<Table.Row>
					<Table.Cell>
						<div class="flex flex-col">
							<span>{m.orders_labour()}</span>
							<span class="text-xs text-muted-foreground">
								{order.engineer
									? m.orders_labour_rate({ name: order.engineer.name })
									: m.orders_labour_standard_rate()}
							</span>
						</div>
					</Table.Cell>
					<Table.Cell class="text-right tabular-nums">
						{m.common_count_hours_short({ count: order.laborHours })}
					</Table.Cell>
					<Table.Cell class="text-right tabular-nums">
						{formatCents(totals.laborRate)}
					</Table.Cell>
					<Table.Cell class="text-right tabular-nums">
						{formatCents(totals.labor)}
					</Table.Cell>
				</Table.Row>
				{#each totals.adjustments as adjustment, i (i)}
					<Table.Row>
						<Table.Cell colspan={3}>
							<div class="flex flex-col">
								<span>{adjustment.label}</span>
								{#if adjustment.detail}
									<span class="text-xs text-muted-foreground">{adjustment.detail}</span>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{formatCents(adjustment.amount)}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
			<Table.Footer>
				<Table.Row>
					<Table.Cell colspan={3}>{m.orders_column_total()}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">
						{formatCents(totals.total)}
					</Table.Cell>
				</Table.Row>
			</Table.Footer>
		</Table.Root>
	</Card.Content>
</Card.Root>
