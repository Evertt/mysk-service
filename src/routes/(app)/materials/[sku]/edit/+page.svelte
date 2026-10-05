<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import MaterialForm from "../../material-form.svelte";
	import { getMaterial, updateMaterial } from "../../materials.remote.js";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { material } = $derived(await getMaterial(params.sku));
	const materialHref = $derived(resolve("/(app)/materials/[sku]", { sku: material.sku }));
</script>

<svelte:head>
	<title>Edit {material.name} · Materials</title>
</svelte:head>

<PageHeader title="Edit {material.name}" description={material.sku}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/materials")}>Materials</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Link href={materialHref}>{material.sku}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>Edit</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<MaterialForm form={updateMaterial} {material} cancelHref={materialHref} />
