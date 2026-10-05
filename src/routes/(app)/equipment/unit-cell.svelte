<!--
	@component
	Manufacturer and model, linking to the unit, with its serial number below.
-->
<script lang="ts">
	import EquipmentLink from "#lib/components/equipment/equipment-link.svelte";

	let { name, serialNumber }: { name: string; serialNumber: string } = $props();
</script>

<div class="flex flex-col">
	<EquipmentLink {serialNumber}>{name}</EquipmentLink>
	<span class="font-mono text-xs text-muted-foreground">{serialNumber}</span>
</div>
