<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { CustomerForm } from "#lib/customers/components.ts";
	import { getCustomer, getCustomerFormOptions, updateCustomer } from "#lib/customers/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { customer } = $derived(await getCustomer(params.code));
	const customerHref = $derived(resolve("/(app)/customers/[code]", { code: customer.code }));
</script>

<svelte:head>
	<title>{m.customers_edit_title({ name: customer.name })} · {m.customers_title()}</title>
</svelte:head>

<PageHeader
	title={m.customers_edit_title({ name: customer.name })}
	description={customer.code}
	breadcrumbs={[
		{ label: m.customers_title(), href: resolve("/(app)/customers") },
		{ label: customer.name, href: customerHref },
		{ label: m.common_edit() },
	]}
/>

<CustomerForm
	form={updateCustomer}
	{customer}
	options={await getCustomerFormOptions()}
	cancelHref={customerHref}
/>
