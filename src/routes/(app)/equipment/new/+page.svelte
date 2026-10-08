<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import EquipmentForm from "../equipment-form.svelte";
	import { createEquipment, getEquipmentFormOptions } from "../equipment.remote.js";
</script>

<svelte:head>
	<title>{m.equipment_new()} · {m.equipment_title()}</title>
</svelte:head>

<PageHeader title={m.equipment_new()} description={m.equipment_new_description()}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/equipment")}>{m.equipment_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.equipment_breadcrumb_new()}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<EquipmentForm
	form={createEquipment}
	options={await getEquipmentFormOptions()}
	cancelHref={resolve("/(app)/equipment")}
/>
