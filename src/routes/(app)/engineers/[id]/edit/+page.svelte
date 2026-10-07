<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import EngineerForm from "../../engineer-form.svelte";
	import { getEngineer, updateEngineer } from "../../engineers.remote.js";
	import type { PageProps } from "./$types";
	import AccountCard from "./account-card.svelte";

	let { params }: PageProps = $props();

	const { engineer } = $derived(await getEngineer(params.id));
	const engineerHref = $derived(resolve("/(app)/engineers/[id]", { id: String(engineer.id) }));
</script>

<svelte:head>
	<title>Edit {engineer.name} · Engineers</title>
</svelte:head>

<PageHeader title="Edit {engineer.name}" description={engineer.email}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/engineers")}>Engineers</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Link href={engineerHref}>{engineer.name}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>Edit</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<EngineerForm form={updateEngineer} {engineer} cancelHref={engineerHref} />

<AccountCard engineerId={engineer.id} />
