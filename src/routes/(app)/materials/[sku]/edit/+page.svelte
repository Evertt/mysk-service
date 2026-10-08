<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import MaterialForm from "../../material-form.svelte";
	import { getMaterial, updateMaterial } from "../../material.remote.js";
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

<PageHeader title={m.materials_edit_title({ name: material.name })} description={material.sku}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/materials")}>{m.materials_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Link href={materialHref}>{material.sku}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.common_edit()}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<MaterialForm form={updateMaterial} {material} cancelHref={materialHref} />
