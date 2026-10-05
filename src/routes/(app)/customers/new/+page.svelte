<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import CustomerForm from "../customer-form.svelte";
	import { createCustomer, getCustomerFormOptions } from "../customers.remote.js";
</script>

<svelte:head>
	<title>New customer · Customers</title>
</svelte:head>

<PageHeader
	title="New customer"
	description="Register a company we install or service equipment for."
>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/customers")}>Customers</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>New</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<CustomerForm
	form={createCustomer}
	options={await getCustomerFormOptions()}
	cancelHref={resolve("/(app)/customers")}
/>
