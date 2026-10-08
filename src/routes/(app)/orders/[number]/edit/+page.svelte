<script lang="ts">
	import { resolve } from "$app/paths";
	import LockIcon from "@lucide/svelte/icons/lock";

	import PageHeader from "#lib/components/page-header.svelte";
	import { isEditableOrder } from "#lib/models.js";

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

{#if isEditableOrder(order.status)}
	<OrderForm
		form={updateOrder}
		{order}
		options={await getOrderFormOptions()}
		cancelHref={orderHref}
	/>
{:else}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Media variant="icon">
				<LockIcon />
			</Empty.Media>
			<Empty.Title>{order.number} is invoiced</Empty.Title>
			<Empty.Description>
				It's on an invoice that has been sent, with its amounts, so it can't be changed. If that
				invoice is voided, the order is completed again and can be changed.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={orderHref}>Back to the order</Button>
		</Empty.Content>
	</Empty.Root>
{/if}
