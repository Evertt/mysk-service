<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import CustomerForm from "../customer-form.svelte";
	import { createCustomer, getCustomerFormOptions } from "../customers.remote.js";
</script>

<svelte:head>
	<title>{m.customers_new()} · {m.customers_title()}</title>
</svelte:head>

<PageHeader title={m.customers_new()} description={m.customers_new_description()}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/customers")}>{m.customers_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.customers_breadcrumb_new()}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<CustomerForm
	form={createCustomer}
	options={await getCustomerFormOptions()}
	cancelHref={resolve("/(app)/customers")}
/>
