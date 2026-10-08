<script lang="ts">
	import { resolve } from "$app/paths";
	import LockIcon from "@lucide/svelte/icons/lock";

	import PageHeader from "#lib/components/page-header.svelte";
	import { isEditableOrder } from "#lib/models.js";

	import OrderForm from "../../order-form.svelte";
	import { getOrder, getOrderFormOptions, updateOrder } from "../../order.remote.js";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { order } = $derived(await getOrder(params.number));
	const orderHref = $derived(resolve("/(app)/orders/[number]", { number: order.number }));
</script>

<svelte:head>
	<title>{m.orders_edit_page_title({ number: order.number })}</title>
</svelte:head>

<PageHeader title={m.orders_edit_title({ number: order.number })} description={order.customer.name}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/orders")}>{m.orders_title()}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Link href={orderHref}>{order.number}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{m.common_edit()}</Breadcrumb.Page>
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
			<Empty.Title>{m.orders_invoiced_title({ number: order.number })}</Empty.Title>
			<Empty.Description>{m.orders_invoiced_description()}</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={orderHref}>{m.orders_back_to_order()}</Button>
		</Empty.Content>
	</Empty.Root>
{/if}
