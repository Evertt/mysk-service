<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { OrderForm } from "#lib/orders/components.ts";
	import { createOrder, getOrderFormOptions } from "#lib/orders/remotes.ts";
</script>

<svelte:head>
	<title>{m.orders_new_page_title()}</title>
</svelte:head>

<PageHeader
	title={m.orders_new()}
	description={m.orders_new_description()}
	breadcrumbs={[
		{ label: m.orders_title(), href: resolve("/(app)/orders") },
		{ label: m.orders_breadcrumb_new() },
	]}
/>

<OrderForm
	form={createOrder}
	options={await getOrderFormOptions()}
	cancelHref={resolve("/(app)/orders")}
/>
