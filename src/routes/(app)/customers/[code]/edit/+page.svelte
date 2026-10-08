<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import CustomerForm from "../../customer-form.svelte";
	import { getCustomer, getCustomerFormOptions, updateCustomer } from "../../customers.remote.js";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { customer } = $derived(await getCustomer(params.code));
	const customerHref = $derived(resolve("/(app)/customers/[code]", { code: customer.code }));
</script>

<svelte:head>
	<title>{m.customers_edit_title({ name: customer.name })} · {m.customers_title()}</title>
</svelte:head>

<PageHeader title={m.customers_edit_title({ name: customer.name })} description={customer.code}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/customers")}>{m.customers_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Link href={customerHref}>{customer.name}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.common_edit()}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<CustomerForm
	form={updateCustomer}
	{customer}
	options={await getCustomerFormOptions()}
	cancelHref={customerHref}
/>
