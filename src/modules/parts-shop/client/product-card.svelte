<!--
	@component
	A product in the portal's catalogue: its SKU, name and description, how it's sold, its price
	excluding VAT, its stock, whether it's popular and payable with Parts Credit, the checklist points
	it fixes, and the way to put it in the cart (or change how many are in it). A product on request
	can't be added.
-->
<script lang="ts">
	import MinusIcon from "@lucide/svelte/icons/minus";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatCents, formatNumber } from "#lib/i18n/index.ts";

	import { productStockDisplay } from "../display.ts";
	import { shopLabels } from "../labels.ts";
	import { isOrderable, maxQuantity, type ProductStock, type ProductUnit } from "../model.ts";

	interface Product {
		id: number;
		sku: string;
		name: string;
		description: string | null;
		price: number;
		stock: number;
		unit: ProductUnit;
		popular: boolean;
		creditEligible: boolean;
		onRequest: boolean;
		availability: ProductStock;
		checkpoints: string[];
	}

	let {
		product,
		quantity,
		onchange,
	}: {
		product: Product;
		/** How many are in the cart. */
		quantity: number;
		onchange: (quantity: number) => void;
	} = $props();

	const orderable = $derived(isOrderable(product) && product.availability !== "on_request");
	const most = $derived(Math.min(maxQuantity, product.stock));
</script>

<Card.Root class="h-full" data-product={product.sku}>
	<Card.Header>
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="font-mono text-xs text-muted-foreground">{product.sku}</span>
			{#if product.popular}
				<Badge variant="info">{m.shop_popular()}</Badge>
			{/if}
		</div>
		<Card.Title>{product.name}</Card.Title>
		{#if product.description}
			<Card.Description>{product.description}</Card.Description>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-1 flex-col gap-3">
		<div class="flex flex-wrap items-center gap-1.5">
			<EnumBadge
				display={productStockDisplay}
				value={product.availability}
				data-stock={product.availability}
			/>
			{#if product.creditEligible && !product.onRequest}
				<Badge variant="success" data-credit-eligible>{m.shop_credit_eligible()}</Badge>
			{/if}
		</div>
		{#if product.checkpoints.length}
			<div class="flex flex-col gap-1">
				<span class="text-xs font-medium">{m.shop_checkpoints()}</span>
				<ul class="flex flex-col gap-0.5 text-xs text-muted-foreground">
					{#each product.checkpoints as point, i (i)}
						<li>{point}</li>
					{/each}
				</ul>
			</div>
		{/if}
		<div class="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
			<div class="flex flex-col">
				{#if product.onRequest}
					<span class="font-semibold">{m.shop_price_on_request()}</span>
				{:else}
					<span class="font-semibold tabular-nums" data-price>{formatCents(product.price)}</span>
					<span class="text-xs text-muted-foreground">
						{m.shop_excl_vat()} · {shopLabels.label("productUnit", product.unit)}
					</span>
				{/if}
			</div>
			{#if !orderable}
				<Button size="sm" variant="outline" disabled>
					{product.onRequest || product.availability === "on_request"
						? m.shop_enum_product_stock_on_request()
						: m.shop_not_eligible()}
				</Button>
			{:else if quantity}
				<div class="flex items-center gap-1" data-cart-quantity>
					<Button
						size="icon-sm"
						variant="outline"
						aria-label={m.shop_cart_less({ name: product.name })}
						onclick={() => onchange(quantity - 1)}
					>
						<MinusIcon />
					</Button>
					<span class="w-8 text-center tabular-nums">{formatNumber(quantity)}</span>
					<Button
						size="icon-sm"
						variant="outline"
						aria-label={m.shop_cart_more({ name: product.name })}
						disabled={quantity >= most}
						onclick={() => onchange(quantity + 1)}
					>
						<PlusIcon />
					</Button>
				</div>
			{:else}
				<Button size="sm" onclick={() => onchange(1)} data-add-to-cart>
					<PlusIcon data-icon="inline-start" />
					{m.shop_cart_add()}
				</Button>
			{/if}
		</div>
	</Card.Content>
</Card.Root>
