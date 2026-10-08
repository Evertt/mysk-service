<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import OrderForm from "../order-form.svelte";
	import { createOrder, getOrderFormOptions } from "../orders.remote.js";
</script>

<svelte:head>
	<title>{m.orders_new_page_title()}</title>
</svelte:head>

<PageHeader title={m.orders_new()} description={m.orders_new_description()}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/orders")}>{m.orders_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.orders_breadcrumb_new()}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<OrderForm
	form={createOrder}
	options={await getOrderFormOptions()}
	cancelHref={resolve("/(app)/orders")}
/>
