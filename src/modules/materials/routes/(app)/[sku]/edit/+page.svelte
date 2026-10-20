<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import MaterialForm from "#modules/materials/form/material-form.svelte";
	import { getMaterial, updateMaterial } from "#modules/materials/material.remote.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/materials/[sku]/edit"> } = $props();

	const { material } = $derived(await getMaterial(params.sku));
	const materialHref = $derived(resolve("/(app)/(modules)/materials/[sku]", { sku: material.sku }));
</script>

<PageHeader
	title={m.materials_edit_title({ name: material.name })}
	description={material.sku}
	breadcrumbs={[
		{ label: m.materials_title(), href: resolve("/(app)/(modules)/materials") },
		{ label: material.sku, href: materialHref },
		{ label: m.common_edit() },
	]}
/>

<MaterialForm form={updateMaterial} {material} cancelHref={materialHref} />
