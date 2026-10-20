<!--
	The shop's catalogue in the office: every material of the tenant's, those in the shop with their
	category, how they're sold and their flags, and the checklist points they fix; a material is put
	in the shop, changed or taken out of it in a dialog. Without categories, the way to set them up.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents, formatNumber } from "#lib/i18n/index.ts";
	import ProductDialog from "#modules/parts-shop/form/product-dialog.svelte";
	import { shopLabels } from "#modules/parts-shop/labels.ts";
	import { getShopProducts } from "#modules/parts-shop/products.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/parts-shop/products"> } = $props();

	const data = $derived(await getShopProducts());
	const categoryName = $derived(
		new Map(data.categories.map((category) => [category.id, category.name])),
	);
	/** The material whose dialog is open. */
	let editing = $state<number | null>(null);
	let dialogOpen = $state(false);
	const edited = $derived(data.materials.find((each) => each.materialId === editing));
	const inShop = $derived(data.materials.filter((each) => each.product).length);
</script>

<svelte:head>
	<title>{m.shop_products_title()}</title>
</svelte:head>

<PageHeader
	title={m.shop_products_title()}
	description={m.shop_products_description({ count: inShop })}
	breadcrumbs={[
		{ label: m.shop_orders_title(), href: resolve("/(app)/(modules)/parts-shop") },
		{ label: m.shop_products_title() },
	]}
>
	{#snippet actions()}
		<Button variant="outline" href={resolve("/(app)/(modules)/parts-shop/settings")}>
			{m.shop_categories_title()}
		</Button>
	{/snippet}
</PageHeader>

{#if !data.categories.length}
	<Card.Root data-shop-no-categories>
		<Card.Header>
			<Card.Title>{m.shop_categories_none()}</Card.Title>
			<Card.Description>{m.shop_categories_none_description()}</Card.Description>
		</Card.Header>
	</Card.Root>
{/if}

<Card.Root data-shop-products>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.shop_column_sku()}</Table.Head>
					<Table.Head>{m.shop_column_product()}</Table.Head>
					<Table.Head>{m.shop_field_category()}</Table.Head>
					<Table.Head class="text-right">{m.shop_column_price()}</Table.Head>
					<Table.Head class="text-right">{m.shop_column_stock()}</Table.Head>
					<Table.Head>{m.shop_column_shop()}</Table.Head>
					<Table.Head><span class="sr-only">{m.common_edit()}</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.materials as each (each.materialId)}
					<Table.Row data-shop-material={each.sku}>
						<Table.Cell class="font-mono text-xs">{each.sku}</Table.Cell>
						<Table.Cell class="font-medium">{each.name}</Table.Cell>
						<Table.Cell>
							{each.product ? (categoryName.get(each.product.categoryId) ?? "") : "—"}
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatCents(each.price)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatNumber(each.stock)}</Table.Cell>
						<Table.Cell>
							{#if each.product}
								<div class="flex flex-wrap gap-1">
									<Badge variant="outline"
										>{shopLabels.label("productUnit", each.product.unit)}</Badge
									>
									{#if each.product.onRequest}
										<Badge variant="neutral">{m.shop_enum_product_stock_on_request()}</Badge>
									{/if}
									{#if each.product.creditEligible}
										<Badge variant="success">{m.shop_credit_eligible()}</Badge>
									{/if}
									{#if each.product.popular}
										<Badge variant="info">{m.shop_popular()}</Badge>
									{/if}
									{#if each.product.checkpointIds.length}
										<Badge variant="outline" data-checkpoint-count>
											{m.shop_checkpoint_count({ count: each.product.checkpointIds.length })}
										</Badge>
									{/if}
								</div>
							{:else}
								<span class="text-sm text-muted-foreground">{m.shop_not_in_shop()}</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right">
							<Button
								size="sm"
								variant="outline"
								disabled={!data.categories.length}
								onclick={() => {
									editing = each.materialId;
									dialogOpen = true;
								}}
							>
								{each.product ? m.common_edit() : m.shop_add_to_shop()}
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>

{#if edited}
	{#key edited.materialId}
		<ProductDialog
			bind:open={dialogOpen}
			material={edited}
			categories={data.categories}
			checkpoints={data.checkpoints}
		/>
	{/key}
{/if}
