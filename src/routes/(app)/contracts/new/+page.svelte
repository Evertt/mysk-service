<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import ContractForm from "../contract-form.svelte";
	import { createContract, getContractFormOptions } from "../contracts.remote.js";
</script>

<svelte:head>
	<title>New contract · Service contracts</title>
</svelte:head>

<PageHeader
	title="New contract"
	description="Agree on maintenance cover for a customer's equipment."
>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/contracts")}>Service contracts</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>New</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<ContractForm
	form={createContract}
	options={await getContractFormOptions()}
	cancelHref={resolve("/(app)/contracts")}
/>
