<!--
	@component
	The materials module's card on a unit of equipment's page (`equipment.detail.side`,
	`#lib/equipment/extensions.ts`): the parts used on the unit ("Onderdelen"), per material, from
	the lines of its completed orders, marked as shared when an order of them was for several units.
-->
<script lang="ts">
	import { formatDate } from "#lib/i18n/index.ts";

	import { getPartsUsed } from "../../detail/parts-used.remote.ts";
	import { formatQuantity } from "../../display.ts";
	import MaterialLink from "../../ui/material-link.svelte";

	let { serialNumber }: { serialNumber: string } = $props();

	const parts = $derived(await getPartsUsed(serialNumber));
</script>

<Card.Root data-parts-used>
	<Card.Header>
		<Card.Title>{m.materials_parts_title()}</Card.Title>
		<Card.Description>{m.materials_parts_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if parts.length}
			<ul class="flex flex-col divide-y">
				{#each parts as part (part.sku)}
					<!-- The quantity beside the name, which truncates rather than push it out of a narrow
						card; how often and when it was used on a line of its own below. -->
					<li class="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0">
								<MaterialLink sku={part.sku} name={part.name} />
							</div>
							<span class="shrink-0 text-sm font-medium whitespace-nowrap tabular-nums"
								>{formatQuantity(part.quantity, part.unit)}</span
							>
						</div>
						<p class="text-xs text-muted-foreground">
							{m.materials_parts_orders({ count: part.orders })}{part.lastUsed
								? ` · ${m.materials_parts_last_used({ date: formatDate(part.lastUsed) })}`
								: ""}
							<!-- Its lines count on each of the order's units: not this unit's alone. -->
							{#if part.units > 1}
								<span data-shared>· {m.materials_parts_shared({ count: part.units })}</span>
							{/if}
						</p>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">{m.materials_parts_empty()}</p>
		{/if}
	</Card.Content>
</Card.Root>
