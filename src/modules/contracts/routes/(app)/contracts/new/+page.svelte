<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";

	import ContractForm from "../contract-form.svelte";
	import { createContract, getContractFormOptions } from "../contracts.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/contracts/new"> } = $props();
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
