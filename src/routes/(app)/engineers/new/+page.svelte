<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { EngineerForm } from "#lib/engineers/components.ts";
	import { createEngineer } from "#lib/engineers/remotes.ts";
</script>

<PageHeader
	title={m.engineers_new()}
	description={m.engineers_new_description()}
	breadcrumbs={[
		{ label: m.engineers_title(), href: resolve("/(app)/engineers") },
		{ label: m.engineers_breadcrumb_new() },
	]}
/>

<EngineerForm form={createEngineer} cancelHref={resolve("/(app)/engineers")} />
