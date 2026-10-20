<script lang="ts">
	import { resolve } from "$app/paths";

	import ChangedElsewhere from "#lib/components/activity/changed-elsewhere.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { EquipmentForm } from "#lib/equipment/components.ts";
	import {
		getEquipment,
		getEquipmentFormOptions,
		updateEquipment,
	} from "#lib/equipment/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { unit, orderCount } = $derived(await getEquipment(params.serial));
	const unitHref = $derived(resolve("/(app)/equipment/[serial]", { serial: unit.serialNumber }));
	// Counts the reloads of the latest version, which start the form afresh.
	let loaded = $state(0);
</script>

<PageHeader
	title={m.equipment_edit_title({ serial: unit.serialNumber })}
	description="{unit.manufacturer} {unit.model}"
	breadcrumbs={[
		{ label: m.equipment_title(), href: resolve("/(app)/equipment") },
		{ label: unit.serialNumber, href: unitHref },
		{ label: m.common_edit() },
	]}
/>

<ChangedElsewhere type="equipment" id={unit.id} onreload={() => loaded++} />

{#key loaded}
	<EquipmentForm
		form={updateEquipment}
		{unit}
		{orderCount}
		options={await getEquipmentFormOptions()}
		cancelHref={unitHref}
	/>
{/key}
