<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import RecordPage from "#lib/components/record-page.svelte";
	import StatTile from "#lib/components/stat-tile.svelte";
	import { CustomerLink } from "#lib/customers/components.ts";
	import { formatCents, formatDate, formatNumber, label } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";
	import { orderStatusDisplay } from "#lib/orders/index.ts";
	import CountStockDialog from "#modules/materials/detail/count-stock-dialog.svelte";
	import ReceiveStockDialog from "#modules/materials/detail/receive-stock-dialog.svelte";
	import StockHistory from "#modules/materials/detail/stock-history.svelte";
	import { formatQuantity, stockLevel, stockLevelDisplay } from "#modules/materials/display.ts";
	import { materialLabels } from "#modules/materials/labels.ts";
	import { deleteMaterial, getMaterial } from "#modules/materials/material.remote.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/materials/[sku]"> } = $props();

	const data = $derived(await getMaterial(params.sku));
	const material = $derived(data.material);
	const stats = $derived(data.stats);
	const quantity = (value: number) => formatQuantity(value, material.unit);
	const level = $derived(stockLevel(material.stock, material.unit));
</script>

<RecordPage
	title={material.name}
	subtitle={material.sku}
	list={{ label: m.materials_title(), href: resolve("/(app)/(modules)/materials") }}
	crumb={material.sku}
	edit={resolve("/(app)/(modules)/materials/[sku]/edit", { sku: material.sku })}
	remove={{
		form: deleteMaterial,
		id: String(material.id),
		title: m.materials_delete_title({ name: material.name }),
		description: m.materials_delete_description(),
	}}
	subject={{ type: "material", id: material.id }}
>
	{#snippet badges()}
		<EnumBadge display={stockLevelDisplay} value={level} />
	{/snippet}
	{#snippet actions()}
		<ReceiveStockDialog {material} />
		<CountStockDialog {material} />
	{/snippet}
	{#snippet main()}
		<div class="grid gap-4 sm:grid-cols-3">
			<StatTile
				layout="card"
				label={m.materials_used_last_year()}
				value={quantity(stats.usedLastYear)}
			/>
			<StatTile
				layout="card"
				label={m.materials_open_orders()}
				value={formatNumber(stats.openOrders)}
			/>
			<!-- Order lines take their materials from stock when they're added. -->
			<StatTile
				layout="card"
				label={m.materials_needed()}
				value={quantity(stats.neededForOpenOrders)}
				detail={stats.neededForOpenOrders ? m.materials_needed_taken() : undefined}
			/>
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
									<Table.Cell
										><EnumBadge display={orderStatusDisplay} value={row.status} /></Table.Cell
									>
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
	{/snippet}
	{#snippet side()}
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
							name: materialLabels.label("materialUnit", material.unit),
							symbol: materialLabels.label("materialUnitSymbol", material.unit),
						})}
					/>
					<DetailItem
						label={m.materials_list_price()}
						value={m.materials_list_price_value({
							price: formatCents(material.unitPrice),
							unit: materialLabels.label("materialUnitSymbol", material.unit),
						})}
					/>
					<DetailItem label={m.materials_stock()}>
						<div class="flex flex-wrap items-center gap-2">
							<span class="tabular-nums">{quantity(material.stock)}</span>
							<EnumBadge display={stockLevelDisplay} value={level} />
						</div>
					</DetailItem>
				</dl>
			</Card.Content>
		</Card.Root>
	{/snippet}
</RecordPage>
