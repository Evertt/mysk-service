<!--
	@component
	An order's materials, labour and adjustments, and what it adds up to.
-->
<script lang="ts">
	import { formatCents } from "#lib/format.js";
	import { formatQuantity } from "#lib/materials/display.js";
	import MaterialLink from "#lib/materials/material-link.svelte";

	import type { getOrder } from "../order.remote.js";

	type Data = Awaited<ReturnType<typeof getOrder>>;

	let { order, totals }: { order: Data["order"]; totals: Data["totals"] } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.orders_materials_labour()}</Card.Title>
		<Card.Description>{m.orders_materials_labour_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.orders_line_material()}</Table.Head>
					<Table.Head class="text-right">{m.orders_line_quantity()}</Table.Head>
					<Table.Head class="text-right">{m.orders_line_unit_price()}</Table.Head>
					<Table.Head class="text-right">{m.orders_line_amount()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each order.lines as line (line.id)}
					<Table.Row>
						<Table.Cell>
							<MaterialLink sku={line.material.sku} name={line.material.name} />
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{formatQuantity(line.quantity, line.material.unit)}
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{formatCents(line.unitPrice)}
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatCents(line.total)}</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={4} class="text-center text-muted-foreground">
							{m.orders_no_materials()}
						</Table.Cell>
					</Table.Row>
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
