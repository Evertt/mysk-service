<!--
	@component
	A unit's specifications on its page: its name, make, model, serial number and category, where it
	is (site and location, linked), when it was installed and its warranty.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import DetailItem from "#lib/components/detail-item.svelte";
	import { formatDate } from "#lib/i18n/index.ts";

	import type { getEquipment } from "../equipment.remote.ts";
	import WarrantyBadge from "../ui/warranty-badge.svelte";

	let { unit }: { unit: Awaited<ReturnType<typeof getEquipment>>["unit"] } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.equipment_specifications()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<dl class="grid grid-cols-2 gap-4">
			{#if unit.name}
				<DetailItem label={m.equipment_field_name()} value={unit.name} />
			{/if}
			<DetailItem label={m.equipment_field_manufacturer()} value={unit.manufacturer} />
			<DetailItem label={m.equipment_detail_model()} value={unit.model} />
			<DetailItem label={m.equipment_field_serial_number()} value={unit.serialNumber} />
			<DetailItem label={m.equipment_field_category()} value={unit.category.name} />
			<DetailItem label={m.equipment_detail_site()} value={unit.site.name} />
			<DetailItem
				label={m.equipment_detail_location()}
				value={unit.location?.name}
				href={unit.location
					? resolve("/(app)/equipment/locations/[id]", { id: String(unit.location.id) })
					: undefined}
			/>
			<DetailItem label={m.equipment_column_installed()} value={formatDate(unit.installedAt)} />
			<DetailItem label={m.equipment_field_warranty()}>
				<span class="flex flex-wrap items-center gap-2">
					{formatDate(unit.warrantyUntil)}
					<WarrantyBadge until={unit.warrantyUntil} />
				</span>
			</DetailItem>
		</dl>
	</Card.Content>
</Card.Root>
