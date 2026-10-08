<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import MaterialForm from "../material-form.svelte";
	import { createMaterial } from "../material.remote.js";
</script>

<svelte:head>
	<title>{m.materials_head_title({ title: m.materials_new() })}</title>
</svelte:head>

<PageHeader title={m.materials_new()} description={m.materials_new_description()}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/materials")}>{m.materials_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.materials_breadcrumb_new()}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<MaterialForm form={createMaterial} cancelHref={resolve("/(app)/materials")} />
