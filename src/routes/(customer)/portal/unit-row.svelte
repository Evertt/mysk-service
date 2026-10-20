<!--
	@component
	One of the customer's units in the portal's lists: a link to its page, with what it is, where
	and its state.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { unitLine, unitTitle, equipmentStatusDisplay } from "#lib/equipment/index.ts";
	import type { EquipmentStatus } from "#lib/models.ts";

	let {
		unit,
		showLocation = true,
	}: {
		unit: {
			serialNumber: string;
			name: string | null;
			manufacturer: string;
			model: string;
			status: EquipmentStatus;
			category: string;
			location: string | null;
		};
		showLocation?: boolean;
	} = $props();
</script>

<a
	href={resolve("/(customer)/portal/equipment/[serial]", { serial: unit.serialNumber })}
	class="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent"
	data-unit={unit.serialNumber}
>
	<span class="flex min-w-0 flex-col">
		<span class="truncate text-sm font-medium">{unitTitle(unit)}</span>
		<span class="truncate text-xs text-muted-foreground">
			{unitLine(unit, { category: unit.category, location: showLocation ? unit.location : null })}
		</span>
	</span>
	<EnumBadge display={equipmentStatusDisplay} value={unit.status} />
</a>
