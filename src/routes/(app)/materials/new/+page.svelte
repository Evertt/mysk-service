<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import MaterialForm from "../material-form.svelte";
	import { createMaterial } from "../materials.remote.js";
</script>

<svelte:head>
	<title>New material · Materials</title>
</svelte:head>

<PageHeader title="New material" description="Add a part or consumable to the catalogue.">
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/materials")}>Materials</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>New</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<MaterialForm form={createMaterial} cancelHref={resolve("/(app)/materials")} />
