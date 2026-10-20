<script lang="ts">
	import { resolve } from "$app/paths";

	import ChangedElsewhere from "#lib/components/activity/changed-elsewhere.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { AccountCard, EngineerForm } from "#lib/engineers/components.ts";
	import { getEngineer, updateEngineer } from "#lib/engineers/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { engineer } = $derived(await getEngineer(params.id));
	const engineerHref = $derived(resolve("/(app)/engineers/[id]", { id: String(engineer.id) }));
	// Counts the reloads of the latest version, which start the form afresh.
	let loaded = $state(0);
</script>

<PageHeader
	title={m.engineers_edit_title({ name: engineer.name })}
	description={engineer.email}
	breadcrumbs={[
		{ label: m.engineers_title(), href: resolve("/(app)/engineers") },
		{ label: engineer.name, href: engineerHref },
		{ label: m.common_edit() },
	]}
/>

<ChangedElsewhere type="engineer" id={engineer.id} onreload={() => loaded++} />

{#key loaded}
	<EngineerForm form={updateEngineer} {engineer} cancelHref={engineerHref} />
{/key}

<AccountCard engineerId={engineer.id} />
