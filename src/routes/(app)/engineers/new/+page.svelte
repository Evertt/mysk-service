<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { EngineerForm } from "#lib/engineers/components";
	import { createEngineer } from "#lib/engineers/remote";
</script>

<svelte:head>
	<title>{m.engineers_new()} · {m.engineers_title()}</title>
</svelte:head>

<PageHeader
	title={m.engineers_new()}
	description={m.engineers_new_description()}
	breadcrumbs={[
		{ label: m.engineers_title(), href: resolve("/(app)/engineers") },
		{ label: m.engineers_breadcrumb_new() },
	]}
/>

<EngineerForm form={createEngineer} cancelHref={resolve("/(app)/engineers")} />
