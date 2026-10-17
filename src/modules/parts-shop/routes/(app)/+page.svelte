<!--
	The parts shop's orders in the office: the open ones (placed, confirmed, shipped) to handle, or
	all of them, newest first, each with its customer, status and total; to the products and the
	categories from here.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";
	import { getShopOrders } from "#modules/parts-shop/orders.remote.ts";
	import StatusBadge from "#modules/parts-shop/ui/status-badge.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/parts-shop"> } = $props();

	const view = $derived(page.url.searchParams.get("view") === "all" ? "all" : "open");
	const orders = $derived(await getShopOrders(view));
</script>

<svelte:head>
	<title>{m.shop_orders_title()}</title>
</svelte:head>

<PageHeader title={m.shop_orders_title()} description={m.shop_orders_description()}>
	{#snippet actions()}
		<Button variant="outline" href={resolve("/(app)/(modules)/parts-shop/products")}>
			{m.shop_products_title()}
		</Button>
	{/snippet}
</PageHeader>

<nav class="flex flex-wrap gap-2" aria-label={m.shop_orders_view()}>
	<Button
		size="sm"
		variant={view === "open" ? "default" : "outline"}
		href="?"
		aria-current={view === "open" ? "page" : undefined}
	>
		{m.shop_orders_open()}
	</Button>
	<Button
		size="sm"
		variant={view === "all" ? "default" : "outline"}
		href="?view=all"
		aria-current={view === "all" ? "page" : undefined}
	>
		{m.shop_orders_all()}
	</Button>
</nav>

<Card.Root data-shop-orders>
	<Card.Content>
		{#if orders.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.shop_column_number()}</Table.Head>
						<Table.Head>{m.shop_column_customer()}</Table.Head>
						<Table.Head>{m.shop_column_placed()}</Table.Head>
						<Table.Head>{m.shop_field_status()}</Table.Head>
						<Table.Head class="text-right">{m.shop_field_total()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each orders as order (order.id)}
						<Table.Row data-shop-order={order.number}>
							<Table.Cell class="font-medium">
								<a
									class="hover:underline"
									href={resolve("/(app)/(modules)/parts-shop/orders/[number]", {
										number: order.number,
									})}
								>
									{order.number}
								</a>
							</Table.Cell>
							<Table.Cell>
								<a
									class="hover:underline"
									href={resolve("/(app)/customers/[code]", { code: order.customer.code })}
								>
									{order.customer.name}
								</a>
							</Table.Cell>
							<Table.Cell class="tabular-nums">{formatDate(order.createdAt)}</Table.Cell>
							<Table.Cell><StatusBadge status={order.status} /></Table.Cell>
							<Table.Cell class="text-right tabular-nums">{formatCents(order.total)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>
						{view === "open" ? m.shop_orders_none_open() : m.shop_orders_none()}
					</Empty.Title>
					<Empty.Description>{m.shop_orders_none_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
