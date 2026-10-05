<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import EquipmentForm from "../equipment-form.svelte";
	import { createEquipment, getEquipmentFormOptions } from "../equipment.remote.js";
</script>

<svelte:head>
	<title>New unit · Equipment</title>
</svelte:head>

<PageHeader title="New unit" description="Register a machine installed at a customer site.">
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/equipment")}>Equipment</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>New</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<EquipmentForm
	form={createEquipment}
	options={await getEquipmentFormOptions()}
	cancelHref={resolve("/(app)/equipment")}
/>
