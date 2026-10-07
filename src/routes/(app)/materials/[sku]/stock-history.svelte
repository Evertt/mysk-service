<!--
	@component
	A material's stock movements, newest first: what changed the stock, by how much, the stock
	after it, and who did it.
-->
<script lang="ts">
	import { formatQuantity } from "#lib/components/materials/display.js";
	import OrderLink from "#lib/components/orders/order-link.svelte";
	import { formatDate } from "#lib/format.js";
	import type { MaterialUnit } from "#lib/models.js";

	import type { getMaterial } from "../materials.remote.js";
	import { formatChange, movementKindLabels } from "./stock-history.js";

	type Movement = Awaited<ReturnType<typeof getMaterial>>["movements"][number];

	let { movements, unit }: { movements: Movement[]; unit: MaterialUnit } = $props();
</script>

{#if movements.length}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Date</Table.Head>
				<Table.Head>Movement</Table.Head>
				<Table.Head class="text-right">Change</Table.Head>
				<Table.Head class="text-right">Stock</Table.Head>
				<Table.Head>By</Table.Head>
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
								{movementKindLabels[movement.kind]}
								{#if movement.order}
									<OrderLink number={movement.order.number} />
								{:else if movement.orderNumber}
									<span class="text-muted-foreground">{movement.orderNumber} (deleted)</span>
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
			<Empty.Title>No movements yet</Empty.Title>
			<Empty.Description>Receipts, counts and orders change the stock.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
