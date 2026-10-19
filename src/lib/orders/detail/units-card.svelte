<!--
	@component
	The units an order is about, on its page, in the order they're worked on: each one's name (linked
	to its page), make and serial number, where it is (site and location), category, status and
	warranty on the day the order was made. "New installation" for an order without units.
-->
<script lang="ts">
	import {
		EquipmentLink,
		StatusBadge as EquipmentStatusBadge,
		WarrantyBadge,
	} from "#lib/equipment/components.ts";
	import { unitLine, unitTitle } from "#lib/equipment/index.ts";
	import { formatDate } from "#lib/i18n/index.ts";

	import type { getOrder } from "../order.remote.ts";

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
			<ol class="flex flex-col divide-y" aria-label={m.orders_units()}>
				{#each order.units as unit (unit.id)}
					<li class="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<EquipmentLink serialNumber={unit.serialNumber}>{unitTitle(unit)}</EquipmentLink>
							<EquipmentStatusBadge status={unit.status} />
						</div>
						<p class="text-muted-foreground">
							{unitLine(unit, {
								category: unit.category,
								site: unit.site.name,
								location: unit.location,
							})}
						</p>
						<p class="flex flex-wrap items-center gap-2 text-muted-foreground">
							{m.orders_warranty_until({ date: formatDate(unit.warrantyUntil) })}
							<WarrantyBadge until={unit.warrantyUntil} at={order.createdAt} />
						</p>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="text-sm text-muted-foreground">{m.orders_equipment_unregistered()}</p>
		{/if}
	</Card.Content>
</Card.Root>
