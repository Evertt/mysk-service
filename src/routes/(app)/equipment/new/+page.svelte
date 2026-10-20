<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { EquipmentForm } from "#lib/equipment/components.ts";
	import { createEquipment, getEquipmentFormOptions } from "#lib/equipment/remotes.ts";
</script>

<PageHeader
	title={m.equipment_new()}
	description={m.equipment_new_description()}
	breadcrumbs={[
		{ label: m.equipment_title(), href: resolve("/(app)/equipment") },
		{ label: m.equipment_breadcrumb_new() },
	]}
/>

<EquipmentForm
	form={createEquipment}
	options={await getEquipmentFormOptions()}
	cancelHref={resolve("/(app)/equipment")}
/>
