<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import MaterialForm from "../../material-form.svelte";
	import { getMaterial, updateMaterial } from "../../material.remote.ts";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { material } = $derived(await getMaterial(params.sku));
	const materialHref = $derived(resolve("/(app)/materials/[sku]", { sku: material.sku }));
</script>

<svelte:head>
	<title>
		{m.materials_head_title({ title: m.materials_edit_title({ name: material.name }) })}
	</title>
</svelte:head>

<PageHeader
	title={m.materials_edit_title({ name: material.name })}
	description={material.sku}
	breadcrumbs={[
		{ label: m.materials_title(), href: resolve("/(app)/materials") },
		{ label: material.sku, href: materialHref },
		{ label: m.common_edit() },
	]}
/>

<MaterialForm form={updateMaterial} {material} cancelHref={materialHref} />
