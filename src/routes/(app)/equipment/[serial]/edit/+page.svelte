<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import EquipmentForm from "../../equipment-form.svelte";
	import {
		getEquipment,
		getEquipmentFormOptions,
		updateEquipment,
	} from "../../equipment.remote.js";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { unit, orderCount } = $derived(await getEquipment(params.serial));
	const unitHref = $derived(resolve("/(app)/equipment/[serial]", { serial: unit.serialNumber }));
</script>

<svelte:head>
	<title>{m.equipment_edit_title({ serial: unit.serialNumber })} · {m.equipment_title()}</title>
</svelte:head>

<PageHeader
	title={m.equipment_edit_title({ serial: unit.serialNumber })}
	description="{unit.manufacturer} {unit.model}"
	breadcrumbs={[
		{ label: m.equipment_title(), href: resolve("/(app)/equipment") },
		{ label: unit.serialNumber, href: unitHref },
		{ label: m.common_edit() },
	]}
/>

<EquipmentForm
	form={updateEquipment}
	{unit}
	{orderCount}
	options={await getEquipmentFormOptions()}
	cancelHref={unitHref}
/>
