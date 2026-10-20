<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import {
		getContract,
		getContractFormOptions,
		updateContract,
	} from "#modules/contracts/contracts.remote.ts";
	import ContractForm from "#modules/contracts/form/contract-form.svelte";

	let { params }: { params: RouteParams<"/(app)/(modules)/contracts/[number]/edit"> } = $props();

	const { contract } = $derived(await getContract(params.number));
	const contractHref = $derived(
		resolve("/(app)/(modules)/contracts/[number]", { number: contract.number }),
	);
</script>

<PageHeader
	title={m.contracts_edit_title({ number: contract.number })}
	description={contract.customer.name}
	breadcrumbs={[
		{ label: m.contracts_title(), href: resolve("/(app)/(modules)/contracts") },
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
