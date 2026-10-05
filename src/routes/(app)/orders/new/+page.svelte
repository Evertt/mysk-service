<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import OrderForm from "../order-form.svelte";
	import { createOrder, getOrderFormOptions } from "../orders.remote.js";
</script>

<svelte:head>
	<title>New order · Orders</title>
</svelte:head>

<PageHeader title="New order" description="Quote or schedule work for a customer.">
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/orders")}>Orders</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>New</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<OrderForm
	form={createOrder}
	options={await getOrderFormOptions()}
	cancelHref={resolve("/(app)/orders")}
/>
