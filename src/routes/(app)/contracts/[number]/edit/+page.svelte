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
>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/contracts")}>{m.contracts_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Link href={contractHref}>{contract.number}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.common_edit()}</Breadcrumb.Page>
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
