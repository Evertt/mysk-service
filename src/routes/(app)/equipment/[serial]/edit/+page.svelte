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

	const { unit, history } = $derived(await getEquipment(params.serial));
	const unitHref = $derived(resolve("/(app)/equipment/[serial]", { serial: unit.serialNumber }));
</script>

<svelte:head>
	<title>Edit {unit.serialNumber} · Equipment</title>
</svelte:head>

<PageHeader title="Edit {unit.serialNumber}" description="{unit.manufacturer} {unit.model}">
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/equipment")}>Equipment</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Link href={unitHref}>{unit.serialNumber}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>Edit</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<EquipmentForm
	form={updateEquipment}
	{unit}
	orderCount={history.length}
	options={await getEquipmentFormOptions()}
	cancelHref={unitHref}
/>
