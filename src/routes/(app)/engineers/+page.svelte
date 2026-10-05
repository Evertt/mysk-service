<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";

	import EngineersTable from "./engineers-table.svelte";
	import { getEngineers } from "./engineers.remote.js";
</script>

<svelte:head>
	<title>Engineers</title>
</svelte:head>

<PageHeader title="Engineers" description="Field engineers, their specialties and workload.">
	{#snippet actions()}
		<Button href={resolve("/(app)/engineers/new")}>
			<PlusIcon data-icon="inline-start" />
			New engineer
		</Button>
	{/snippet}
</PageHeader>

<EngineersTable engineers={await getEngineers()} />
