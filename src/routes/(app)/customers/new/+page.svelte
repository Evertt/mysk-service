<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import CustomerForm from "../customer-form.svelte";
	import { createCustomer, getCustomerFormOptions } from "../customers.remote.ts";
</script>

<svelte:head>
	<title>{m.customers_new()} · {m.customers_title()}</title>
</svelte:head>

<PageHeader
	title={m.customers_new()}
	description={m.customers_new_description()}
	breadcrumbs={[
		{ label: m.customers_title(), href: resolve("/(app)/customers") },
		{ label: m.customers_breadcrumb_new() },
	]}
/>

<CustomerForm
	form={createCustomer}
	options={await getCustomerFormOptions()}
	cancelHref={resolve("/(app)/customers")}
/>
