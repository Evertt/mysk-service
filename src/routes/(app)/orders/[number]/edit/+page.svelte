<script lang="ts">
	import { resolve } from "$app/paths";
	import LockIcon from "@lucide/svelte/icons/lock";

	import PageHeader from "#lib/components/page-header.svelte";
	import { isEditableOrder } from "#lib/models.ts";

	import OrderForm from "../../order-form.svelte";
	import { getOrder, getOrderFormOptions, updateOrder } from "../../order.remote.ts";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const { order } = $derived(await getOrder(params.number));
	const orderHref = $derived(resolve("/(app)/orders/[number]", { number: order.number }));
</script>

<svelte:head>
	<title>{m.orders_edit_page_title({ number: order.number })}</title>
</svelte:head>

<PageHeader
	title={m.orders_edit_title({ number: order.number })}
	description={order.customer.name}
	breadcrumbs={[
		{ label: m.orders_title(), href: resolve("/(app)/orders") },
		{ label: order.number, href: orderHref },
		{ label: m.common_edit() },
	]}
/>

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
