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
	import { formatCents, formatDate, formatNumber } from "#lib/format.js";
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
</script>

<svelte:head>
	<title>{m.materials_head_title({ title: material.name })}</title>
</svelte:head>

<PageHeader title={material.name} description={material.sku}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<Breadcrumb.Link href={resolve("/(app)/materials")}>{m.materials_title()}</Breadcrumb.Link>
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
			{m.common_edit()}
		</Button>
		<DeleteDialog
			form={deleteMaterial}
			id={String(material.id)}
			title={m.materials_delete_title({ name: material.name })}
			description={m.materials_delete_description()}
		/>
	{/snippet}
</PageHeader>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
		<div class="grid gap-4 sm:grid-cols-3">
			<Card.Root>
				<Card.Header>
					<Card.Description>{m.materials_used_last_year()}</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{quantity(stats.usedLastYear)}</Card.Title>
				</Card.Header>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>{m.materials_open_orders()}</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{formatNumber(stats.openOrders)}</Card.Title>
				</Card.Header>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>{m.materials_needed()}</Card.Description>
					<Card.Title class="text-2xl tabular-nums">
						{quantity(stats.neededForOpenOrders)}
					</Card.Title>
				</Card.Header>
				{#if stats.neededForOpenOrders}
					<Card.Content>
						<!-- Order lines take their materials from stock when they're added. -->
						<p class="text-sm text-muted-foreground">{m.materials_needed_taken()}</p>
					</Card.Content>
				{/if}
			</Card.Root>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.materials_usage()}</Card.Title>
				<Card.Description>
					{data.usage.length
						? m.materials_usage_description({ count: data.usage.length })
						: m.materials_usage_none()}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.usage.length}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.materials_order()}</Table.Head>
								<Table.Head>{m.materials_customer()}</Table.Head>
								<Table.Head>{m.materials_status()}</Table.Head>
								<Table.Head class="text-right">{m.materials_quantity()}</Table.Head>
								<Table.Head class="text-right">{m.materials_unit_price()}</Table.Head>
								<Table.Head class="text-right">{m.materials_amount()}</Table.Head>
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
							<Empty.Title>{m.materials_usage_empty_title()}</Empty.Title>
							<Empty.Description>{m.materials_usage_empty_description()}</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.materials_history()}</Card.Title>
				<Card.Description>
					{m.materials_history_description()}
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
				<Card.Title>{m.materials_material()}</Card.Title>
				<Card.Description>{m.materials_details_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem label={m.materials_sku()} value={material.sku} />
					<DetailItem
						label={m.materials_unit()}
						value={m.materials_unit_option({
							name: label("materialUnit", material.unit),
							symbol: label("materialUnitSymbol", material.unit),
						})}
					/>
					<DetailItem
						label={m.materials_list_price()}
						value={m.materials_list_price_value({
							price: formatCents(material.unitPrice),
							unit: label("materialUnitSymbol", material.unit),
						})}
					/>
					<DetailItem label={m.materials_stock()}>
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
