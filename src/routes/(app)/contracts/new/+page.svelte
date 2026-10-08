<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import ContractForm from "../contract-form.svelte";
	import { createContract, getContractFormOptions } from "../contracts.remote.js";
</script>

<svelte:head>
	<title>{m.contracts_head_title({ title: m.contracts_new() })}</title>
</svelte:head>

<PageHeader
	title={m.contracts_new()}
	description={m.contracts_new_description()}
	breadcrumbs={[
		{ label: m.contracts_title(), href: resolve("/(app)/contracts") },
		{ label: m.contracts_breadcrumb_new() },
	]}
/>

<ContractForm
	form={createContract}
	options={await getContractFormOptions()}
	cancelHref={resolve("/(app)/contracts")}
/>
