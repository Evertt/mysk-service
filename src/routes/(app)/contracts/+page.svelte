<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";

	import ContractsTable from "./contracts-table.svelte";
	import { getContracts } from "./contracts.remote.js";
</script>

<svelte:head>
	<title>Service contracts</title>
</svelte:head>

<PageHeader
	title="Service contracts"
	description="Maintenance agreements covering customers' equipment with a guaranteed response time."
>
	{#snippet actions()}
		<Button href={resolve("/(app)/contracts/new")}>
			<PlusIcon data-icon="inline-start" />
			New contract
		</Button>
	{/snippet}
</PageHeader>

<ContractsTable contracts={await getContracts()} />
