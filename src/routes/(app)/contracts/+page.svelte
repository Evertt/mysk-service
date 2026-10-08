<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";

	import ContractsTable from "./contracts-table.svelte";
	import { getContracts } from "./contracts.remote.js";
</script>

<svelte:head>
	<title>{m.contracts_title()}</title>
</svelte:head>

<PageHeader title={m.contracts_title()} description={m.contracts_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/contracts/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.contracts_new()}
		</Button>
	{/snippet}
</PageHeader>

<ContractsTable contracts={await getContracts()} />
