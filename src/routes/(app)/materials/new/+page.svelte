<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { MaterialForm } from "#lib/materials/components.ts";
	import { createMaterial } from "#lib/materials/remotes.ts";
</script>

<svelte:head>
	<title>{m.materials_head_title({ title: m.materials_new() })}</title>
</svelte:head>

<PageHeader
	title={m.materials_new()}
	description={m.materials_new_description()}
	breadcrumbs={[
		{ label: m.materials_title(), href: resolve("/(app)/materials") },
		{ label: m.materials_breadcrumb_new() },
	]}
/>

<MaterialForm form={createMaterial} cancelHref={resolve("/(app)/materials")} />
