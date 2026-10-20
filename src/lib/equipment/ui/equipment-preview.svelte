<!--
	@component
	A unit's hover card (`EquipmentLink`): its name or model, make and serial number, status, owner,
	site, category and when it was last serviced, as `getEquipment` answered them (which the unit's
	page shares).
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatDate } from "#lib/i18n/index.ts";

	import { unitModel, unitTitle, equipmentStatusDisplay } from "../display.ts";
	import type { getEquipment } from "../equipment.remote.ts";

	let {
		unit,
		lastService,
	}: Pick<Awaited<ReturnType<typeof getEquipment>>, "unit" | "lastService"> = $props();
</script>

<div class="flex flex-col gap-3" data-equipment-preview={unit.serialNumber}>
	<div class="flex flex-col gap-0.5">
		<div class="flex items-center justify-between gap-2">
			<span class="font-medium">{unitTitle(unit)}</span>
			<EnumBadge display={equipmentStatusDisplay} value={unit.status} />
		</div>
		<span class="text-muted-foreground">
			{unit.name ? `${unitModel(unit)} · ${unit.serialNumber}` : unit.serialNumber}
		</span>
	</div>
	<dl class="grid grid-cols-2 gap-3">
		<DetailItem label={m.equipment_column_customer()} value={unit.customer.name} />
		<DetailItem label={m.equipment_detail_site()} value={unit.site.name} />
		<DetailItem label={m.equipment_column_category()} value={unit.category?.name} />
		<DetailItem
			label={m.equipment_stats_last_service()}
			value={lastService ? formatDate(lastService) : m.equipment_stats_never()}
		/>
	</dl>
</div>
