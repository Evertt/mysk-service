<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";
	import { getContracts } from "#modules/contracts/contracts.remote.ts";
	import ContractsTable from "#modules/contracts/list/contracts-table.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/contracts"> } = $props();
</script>

<PageHeader title={m.contracts_title()} description={m.contracts_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/(modules)/contracts/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.contracts_new()}
		</Button>
	{/snippet}
</PageHeader>

<ContractsTable contracts={await getContracts()} />
