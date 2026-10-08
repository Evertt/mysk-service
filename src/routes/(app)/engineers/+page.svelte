<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";

	import EngineersTable from "./engineers-table.svelte";
	import { getEngineers } from "./engineers.remote.js";
</script>

<svelte:head>
	<title>{m.engineers_title()}</title>
</svelte:head>

<PageHeader title={m.engineers_title()} description={m.engineers_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/engineers/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.engineers_new()}
		</Button>
	{/snippet}
</PageHeader>

<EngineersTable engineers={await getEngineers()} />
