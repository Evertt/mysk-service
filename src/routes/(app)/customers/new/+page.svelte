<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { CustomerForm } from "#lib/customers/components.ts";
	import { createCustomer, getCustomerFormOptions } from "#lib/customers/remotes.ts";
</script>

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
