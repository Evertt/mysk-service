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
	<title>Edit {contract.number} · Service contracts</title>
</svelte:head>

<PageHeader title="Edit {contract.number}" description={contract.customer.name}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/contracts")}>Service contracts</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Link href={contractHref}>{contract.number}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>Edit</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<ContractForm
	form={updateContract}
	{contract}
	options={await getContractFormOptions()}
	cancelHref={contractHref}
/>
