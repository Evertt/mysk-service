<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import EngineerForm from "../engineer-form.svelte";
	import { createEngineer } from "../engineers.remote.js";
</script>

<svelte:head>
	<title>New engineer · Engineers</title>
</svelte:head>

<PageHeader title="New engineer" description="Add a field engineer who can be assigned orders.">
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/engineers")}>Engineers</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>New</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<EngineerForm form={createEngineer} cancelHref={resolve("/(app)/engineers")} />
