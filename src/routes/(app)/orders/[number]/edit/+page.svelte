<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";

	import OrderForm from "../../order-form.svelte";
	import { getOrder, getOrderFormOptions, updateOrder } from "../../orders.remote.js";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { order } = $derived(await getOrder(params.number));
	const orderHref = $derived(resolve("/(app)/orders/[number]", { number: order.number }));
</script>

<svelte:head>
	<title>Edit {order.number} · Orders</title>
</svelte:head>

<PageHeader title="Edit {order.number}" description={order.customer.name}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/orders")}>Orders</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Link href={orderHref}>{order.number}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>Edit</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</PageHeader>

<OrderForm
	form={updateOrder}
	{order}
	options={await getOrderFormOptions()}
	cancelHref={orderHref}
/>
