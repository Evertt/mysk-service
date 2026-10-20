<!--
	A shop order in the office: its customer and who placed it, its lines at the prices then (excluding
	VAT), the Parts Credit it was paid with, the steps it can take next, and its history.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import RecordPage from "#lib/components/record-page.svelte";
	import { CustomerLink } from "#lib/customers/components.ts";
	import { formatCents, formatDateTime, formatNumber } from "#lib/i18n/index.ts";
	import OrderSteps from "#modules/parts-shop/detail/order-steps.svelte";
	import { shopOrderStatusDisplay } from "#modules/parts-shop/display.ts";
	import { lineAmount } from "#modules/parts-shop/model.ts";
	import { getShopOrder } from "#modules/parts-shop/orders.remote.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/parts-shop/orders/[number]"> } = $props();

	const order = $derived(await getShopOrder(params.number));
</script>

<RecordPage
	title={order.number}
	subtitle={m.shop_order_description({ customer: order.customer.name })}
	list={{ label: m.shop_orders_title(), href: resolve("/(app)/(modules)/parts-shop") }}
	subject={{ type: "shop_order", id: order.id }}
>
	{#snippet badges()}
		<EnumBadge
			display={shopOrderStatusDisplay}
			value={order.status}
			data-shop-status={order.status}
		/>
	{/snippet}
	{#snippet actions()}
		<OrderSteps number={order.number} status={order.status} total={order.total} />
	{/snippet}
	{#snippet main()}
		<Card.Root data-shop-order-lines>
			<Card.Header>
				<Card.Title>{m.shop_order_lines()}</Card.Title>
				<Card.Description>{m.shop_prices_excl_vat()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.shop_column_sku()}</Table.Head>
							<Table.Head>{m.shop_column_product()}</Table.Head>
							<Table.Head class="text-right">{m.shop_column_quantity()}</Table.Head>
							<Table.Head class="text-right">{m.shop_column_price()}</Table.Head>
							<Table.Head class="text-right">{m.shop_column_amount()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each order.lines as line (line.id)}
							<Table.Row data-shop-line={line.sku}>
								<Table.Cell class="font-mono text-xs">{line.sku}</Table.Cell>
								<Table.Cell>{line.name}</Table.Cell>
								<Table.Cell class="text-right tabular-nums"
									>{formatNumber(line.quantity)}</Table.Cell
								>
								<Table.Cell class="text-right tabular-nums"
									>{formatCents(line.unitPrice)}</Table.Cell
								>
								<Table.Cell class="text-right tabular-nums">
									{formatCents(lineAmount(line.quantity, line.unitPrice))}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
					<Table.Footer>
						<Table.Row>
							<Table.Cell colspan={4}>{m.shop_total_excl_vat()}</Table.Cell>
							<Table.Cell class="text-right font-semibold tabular-nums" data-shop-total>
								{formatCents(order.total)}
							</Table.Cell>
						</Table.Row>
					</Table.Footer>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/snippet}
	{#snippet side()}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.shop_order_details()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-4">
					<DetailItem label={m.shop_column_customer()}>
						<CustomerLink
							code={order.customer.code}
							name={order.customer.name}
							class="underline-offset-4 hover:underline"
						/>
					</DetailItem>
					<DetailItem label={m.shop_field_placed_by()} value={order.placedBy} />
					<DetailItem label={m.shop_column_placed()} value={formatDateTime(order.createdAt)} />
					<DetailItem label={m.shop_field_payment()} value={m.shop_payment_parts_credit()} />
					<DetailItem label={m.shop_field_credit_paid()} value={formatCents(order.total)} />
					<DetailItem label={m.shop_field_vat()} value={formatCents(order.vat)} />
				</dl>
			</Card.Content>
		</Card.Root>
	{/snippet}
</RecordPage>
