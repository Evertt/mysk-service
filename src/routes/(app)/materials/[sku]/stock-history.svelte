<!--
	@component
	A material's stock movements, newest first: what changed the stock, by how much, the stock
	after it, and who did it.
-->
<script lang="ts">
	import { formatDate } from "#lib/i18n/format.ts";
	import { label } from "#lib/i18n/labels.ts";
	import { formatQuantity } from "#lib/materials/display.ts";
	import type { MaterialUnit } from "#lib/models.ts";
	import OrderLink from "#lib/orders/order-link.svelte";

	import type { getMaterial } from "../material.remote.ts";
	import { formatChange } from "./stock-history.ts";

	type Movement = Awaited<ReturnType<typeof getMaterial>>["movements"][number];

	let { movements, unit }: { movements: Movement[]; unit: MaterialUnit } = $props();
</script>

{#if movements.length}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>{m.materials_history_date()}</Table.Head>
				<Table.Head>{m.materials_history_movement()}</Table.Head>
				<Table.Head class="text-right">{m.materials_history_change()}</Table.Head>
				<Table.Head class="text-right">{m.materials_stock()}</Table.Head>
				<Table.Head>{m.materials_history_by()}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each movements as movement (movement.id)}
				<Table.Row>
					<Table.Cell class="whitespace-nowrap tabular-nums">
						{formatDate(movement.createdAt)}
					</Table.Cell>
					<Table.Cell>
						<div class="flex flex-col">
							<span class="flex flex-wrap items-center gap-x-1.5">
								{label("stockMovementKind", movement.kind)}
								{#if movement.order}
									<OrderLink number={movement.order.number} />
								{:else if movement.orderNumber}
									<span class="text-muted-foreground">
										{m.materials_history_order_deleted({ number: movement.orderNumber })}
									</span>
								{/if}
							</span>
							{#if movement.note}
								<span class="text-xs whitespace-normal text-muted-foreground">
									{movement.note}
								</span>
							{/if}
						</div>
					</Table.Cell>
					<Table.Cell class="text-right whitespace-nowrap tabular-nums">
						{formatChange(movement.quantity, unit)}
					</Table.Cell>
					<Table.Cell class="text-right whitespace-nowrap tabular-nums">
						{formatQuantity(movement.balance, unit)}
					</Table.Cell>
					<Table.Cell class="text-muted-foreground">
						{movement.user?.name ?? "—"}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{:else}
	<Empty.Root class="p-6">
		<Empty.Header>
			<Empty.Title>{m.materials_history_empty_title()}</Empty.Title>
			<Empty.Description>{m.materials_history_empty_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
