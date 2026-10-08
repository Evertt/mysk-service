<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import ContractForm from "../../contract-form.svelte";
	import { getContract, getContractFormOptions, updateContract } from "../../contracts.remote.js";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { contract } = $derived(await getContract(params.number));
	const contractHref = $derived(resolve("/(app)/contracts/[number]", { number: contract.number }));
</script>

<svelte:head>
	<title>
		{m.contracts_head_title({ title: m.contracts_edit_title({ number: contract.number }) })}
	</title>
</svelte:head>

<PageHeader
	title={m.contracts_edit_title({ number: contract.number })}
	description={contract.customer.name}
	breadcrumbs={[
		{ label: m.contracts_title(), href: resolve("/(app)/contracts") },
		{ label: contract.number, href: contractHref },
		{ label: m.common_edit() },
	]}
/>

<ContractForm
	form={updateContract}
	{contract}
	options={await getContractFormOptions()}
	cancelHref={contractHref}
/>
