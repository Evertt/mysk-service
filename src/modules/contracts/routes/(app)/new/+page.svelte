<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import { createContract, getContractFormOptions } from "#modules/contracts/contracts.remote.ts";
	import ContractForm from "#modules/contracts/form/contract-form.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/contracts/new"> } = $props();
</script>

<PageHeader
	title={m.contracts_new()}
	description={m.contracts_new_description()}
	breadcrumbs={[
		{ label: m.contracts_title(), href: resolve("/(app)/(modules)/contracts") },
		{ label: m.contracts_breadcrumb_new() },
	]}
/>

<ContractForm
	form={createContract}
	options={await getContractFormOptions()}
	cancelHref={resolve("/(app)/(modules)/contracts")}
/>
