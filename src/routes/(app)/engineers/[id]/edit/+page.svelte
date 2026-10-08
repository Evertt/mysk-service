<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import EngineerForm from "../../engineer-form.svelte";
	import { getEngineer, updateEngineer } from "../../engineers.remote.ts";
	import type { PageProps } from "./$types";
	import AccountCard from "./account-card.svelte";

	let { params }: PageProps = $props();

	const { engineer } = $derived(await getEngineer(params.id));
	const engineerHref = $derived(resolve("/(app)/engineers/[id]", { id: String(engineer.id) }));
</script>

<svelte:head>
	<title>{m.engineers_edit_title({ name: engineer.name })} · {m.engineers_title()}</title>
</svelte:head>

<PageHeader
	title={m.engineers_edit_title({ name: engineer.name })}
	description={engineer.email}
	breadcrumbs={[
		{ label: m.engineers_title(), href: resolve("/(app)/engineers") },
		{ label: engineer.name, href: engineerHref },
		{ label: m.common_edit() },
	]}
/>

<EngineerForm form={updateEngineer} {engineer} cancelHref={engineerHref} />

<AccountCard engineerId={engineer.id} />
