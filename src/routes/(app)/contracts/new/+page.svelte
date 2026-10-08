<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import ContractForm from "../contract-form.svelte";
	import { createContract, getContractFormOptions } from "../contracts.remote.js";
</script>

<svelte:head>
	<title>{m.contracts_head_title({ title: m.contracts_new() })}</title>
</svelte:head>

<PageHeader title={m.contracts_new()} description={m.contracts_new_description()}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/contracts")}>{m.contracts_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.contracts_breadcrumb_new()}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<ContractForm
	form={createContract}
	options={await getContractFormOptions()}
	cancelHref={resolve("/(app)/contracts")}
/>
