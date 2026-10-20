<!--
	@component
	The units an order is about, on its page, in the order they're worked on: each one's name (linked
	to its page), make and serial number, where it is (site and location), category, status and
	warranty on the day the order was made. "New installation" for an order without units.
-->
<script lang="ts">
	import { EquipmentLink, WarrantyBadge } from "#lib/equipment/components.ts";
	import { unitTitle } from "#lib/equipment/index.ts";
	import { formatDate } from "#lib/i18n/index.ts";

	import type { getOrder } from "../order.remote.ts";
	import WorkUnits from "../ui/work-units.svelte";

	let {
		order,
	}: {
		order: Pick<Awaited<ReturnType<typeof getOrder>>["order"], "units" | "createdAt">;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.orders_equipment()}</Card.Title>
		{#if order.units.length > 1}
			<Card.Description>{m.common_count_units({ count: order.units.length })}</Card.Description>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if order.units.length}
			<WorkUnits units={order.units} showSite>
				{#snippet title(unit)}
					<EquipmentLink serialNumber={unit.serialNumber}>{unitTitle(unit)}</EquipmentLink>
				{/snippet}
				{#snippet children(unit)}
					<p class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						{m.orders_warranty_until({ date: formatDate(unit.warrantyUntil) })}
						<WarrantyBadge until={unit.warrantyUntil} at={order.createdAt} />
					</p>
				{/snippet}
			</WorkUnits>
		{:else}
			<p class="text-sm text-muted-foreground">{m.orders_equipment_unregistered()}</p>
		{/if}
	</Card.Content>
</Card.Root>
