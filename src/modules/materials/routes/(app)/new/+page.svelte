<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import MaterialForm from "#modules/materials/form/material-form.svelte";
	import { createMaterial } from "#modules/materials/material.remote.ts";

	const _props: { params: RouteParams<"/(app)/(modules)/materials/new"> } = $props();
</script>

<PageHeader
	title={m.materials_new()}
	description={m.materials_new_description()}
	breadcrumbs={[
		{ label: m.materials_title(), href: resolve("/(app)/(modules)/materials") },
		{ label: m.materials_breadcrumb_new() },
	]}
/>

<MaterialForm form={createMaterial} cancelHref={resolve("/(app)/(modules)/materials")} />
