<!--
	The parts shop's orders in the office: the open ones (placed, confirmed, shipped) to handle, or
	all of them, newest first, each with its customer, status and total; to the products and the
	categories from here.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import FilterChips from "#lib/components/filter-chips.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { CustomerLink } from "#lib/customers/components.ts";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";
	import { shopOrderStatusDisplay } from "#modules/parts-shop/display.ts";
	import { getShopOrders } from "#modules/parts-shop/orders.remote.ts";
	import ShopOrderLink from "#modules/parts-shop/ui/shop-order-link.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/parts-shop"> } = $props();

	const view = $derived(page.url.searchParams.get("view") === "all" ? "all" : "open");
	const orders = $derived(await getShopOrders(view));
	const here = resolve("/(app)/(modules)/parts-shop");
	const views = $derived([
		{ value: "open", label: m.shop_orders_open(), href: here },
		{ value: "all", label: m.shop_orders_all(), href: `${here}?view=all` },
	]);
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

<FilterChips label={m.shop_orders_view()} options={views} value={view} />

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
							<Table.Cell><ShopOrderLink number={order.number} /></Table.Cell>
							<Table.Cell>
								<CustomerLink
									code={order.customer.code}
									name={order.customer.name}
									class="hover:underline"
								/>
							</Table.Cell>
							<Table.Cell class="tabular-nums">{formatDate(order.createdAt)}</Table.Cell>
							<Table.Cell
								><EnumBadge
									display={shopOrderStatusDisplay}
									value={order.status}
									data-shop-status={order.status}
								/></Table.Cell
							>
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
