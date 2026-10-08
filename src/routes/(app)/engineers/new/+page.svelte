<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import EngineerForm from "../engineer-form.svelte";
	import { createEngineer } from "../engineers.remote.js";
</script>

<svelte:head>
	<title>{m.engineers_new()} · {m.engineers_title()}</title>
</svelte:head>

<PageHeader title={m.engineers_new()} description={m.engineers_new_description()}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/engineers")}>{m.engineers_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.engineers_breadcrumb_new()}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<EngineerForm form={createEngineer} cancelHref={resolve("/(app)/engineers")} />
