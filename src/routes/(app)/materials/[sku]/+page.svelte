<script lang="ts">
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import CustomerLink from "#lib/components/customers/customer-link.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import DeleteDialog from "#lib/components/form/delete-dialog.svelte";
	import { formatQuantity } from "#lib/components/materials/display.js";
	import StockBadge from "#lib/components/materials/stock-badge.svelte";
	import OrderLink from "#lib/components/orders/order-link.svelte";
	import StatusBadge from "#lib/components/orders/status-badge.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents, formatDate } from "#lib/format.js";
	import { label } from "#lib/i18n/labels.js";

	import { deleteMaterial, getMaterial } from "../materials.remote.js";
	import type { PageProps } from "./$types";
	import CountStockDialog from "./count-stock-dialog.svelte";
	import ReceiveStockDialog from "./receive-stock-dialog.svelte";
	import StockHistory from "./stock-history.svelte";

	let { params }: PageProps = $props();

	const data = $derived(await getMaterial(params.sku));
	const material = $derived(data.material);
	const stats = $derived(data.stats);
	const quantity = (value: number) => formatQuantity(value, material.unit);
	const orders = (count: number) => (count === 1 ? "1 order" : `${count} orders`);
</script>

<svelte:head>
	<title>{material.name} · Materials</title>
</svelte:head>

<PageHeader title={material.name} description={material.sku}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/materials")}>Materials</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Page>{material.sku}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>
	{#snippet badges()}
		<StockBadge stock={material.stock} unit={material.unit} />
	{/snippet}
	{#snippet actions()}
		<ReceiveStockDialog {material} />
		<CountStockDialog {material} />
		<Button variant="outline" href={resolve("/(app)/materials/[sku]/edit", { sku: material.sku })}>
			<PencilIcon data-icon="inline-start" />
			Edit
		</Button>
		<DeleteDialog
			form={deleteMaterial}
			id={String(material.id)}
			title="Delete {material.name}?"
			description="The material is removed from the catalogue permanently, with its stock history."
		/>
	{/snippet}
</PageHeader>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<div class="grid gap-4 sm:grid-cols-3">
			<Card.Root>
				<Card.Header>
					<Card.Description>Used in the last 12 months</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{quantity(stats.usedLastYear)}</Card.Title>
				</Card.Header>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>Open orders needing it</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{stats.openOrders}</Card.Title>
				</Card.Header>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>Needed for open orders</Card.Description>
					<Card.Title class="text-2xl tabular-nums">
						{quantity(stats.neededForOpenOrders)}
					</Card.Title>
				</Card.Header>
				{#if stats.neededForOpenOrders}
					<Card.Content>
						<!-- Order lines take their materials from stock when they're added. -->
						<p class="text-sm text-muted-foreground">Already taken from stock</p>
					</Card.Content>
				{/if}
			</Card.Root>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Usage</Card.Title>
				<Card.Description>
					{data.usage.length
						? `Used on ${orders(data.usage.length)}, most recent first, at the price quoted on each.`
						: "Orders that use this material."}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.usage.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Order</Table.Head>
								<Table.Head>Customer</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head class="text-right">Quantity</Table.Head>
								<Table.Head class="text-right">Unit price</Table.Head>
								<Table.Head class="text-right">Amount</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.usage as row (row.orderId)}
								<Table.Row>
									<Table.Cell>
										<div class="flex flex-col">
											<OrderLink number={row.number} />
											<span class="text-xs text-muted-foreground">
												{formatDate(row.createdAt)}
											</span>
										</div>
									</Table.Cell>
									<Table.Cell>
										<CustomerLink code={row.customer.code} name={row.customer.name} withCode />
									</Table.Cell>
									<Table.Cell><StatusBadge status={row.status} /></Table.Cell>
									<Table.Cell class="text-right tabular-nums">{quantity(row.quantity)}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">
										{formatCents(row.unitPrice)}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{formatCents(row.amount)}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title>Not used yet</Empty.Title>
							<Empty.Description>No order uses this material.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Stock history</Card.Title>
				<Card.Description>
					Every change to the stock, newest first: deliveries, counts and orders.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<StockHistory movements={data.movements} unit={material.unit} />
			</Card.Content>
		</Card.Root>
	</div>

	<div class="flex min-w-0 flex-col gap-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>Material</Card.Title>
				<Card.Description>Catalogue details and current stock.</Card.Description>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem label="SKU" value={material.sku} />
					<DetailItem
						label="Unit"
						value={`${label("materialUnit", material.unit)} (${label("materialUnitSymbol", material.unit)})`}
					/>
					<DetailItem
						label="List price"
						value={`${formatCents(material.unitPrice)} / ${material.unit}`}
					/>
					<DetailItem label="Stock">
						<div class="flex flex-wrap items-center gap-2">
							<span class="tabular-nums">{quantity(material.stock)}</span>
							<StockBadge stock={material.stock} unit={material.unit} />
						</div>
					</DetailItem>
				</dl>
			</Card.Content>
		</Card.Root>

		<ActivityCard type="material" id={material.id} />
	</div>
</div>
