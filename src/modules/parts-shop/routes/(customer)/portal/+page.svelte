<!--
	The parts shop in the customer portal ("Onderdelen Shop"): the catalogue by category, searched by
	name or article number, each product with its price excluding VAT, its stock and the checklist
	points it fixes; a banner when some run low; the cart and its checkout with Parts Credit, beside
	the catalogue on a wide screen. A link from a checklist's rejected point (`?add=<product>`) puts
	that product in the cart.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import SearchIcon from "@lucide/svelte/icons/search";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { untrack } from "svelte";

	import { formatCents, formatNumber } from "#lib/i18n/index.ts";
	import Checkout from "#modules/parts-shop/client/checkout.svelte";
	import { getClientShop } from "#modules/parts-shop/client/client-shop.remote.ts";
	import ProductCard from "#modules/parts-shop/client/product-card.svelte";
	import { isOrderable, lineAmount } from "#modules/parts-shop/model.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(customer)/(modules)/parts-shop/portal"> } = $props();

	const shop = $derived(await getClientShop());

	/** The cart: how many of each product, in the order they were added. */
	let cart = $state<{ productId: number; quantity: number }[]>([]);
	let search = $state("");
	let category = $state<number | null>(null);

	// A product a checklist's rejected point needs, put in the cart once.
	const toAdd = Number(untrack(() => page.url.searchParams.get("add")));
	if (toAdd) {
		const product = untrack(() => shop.products.find((each) => each.id === toAdd));
		if (product && isOrderable(product) && product.availability !== "on_request") {
			cart.push({ productId: toAdd, quantity: 1 });
		}
	}

	const quantityOf = (productId: number) =>
		cart.find((line) => line.productId === productId)?.quantity ?? 0;

	function setQuantity(productId: number, quantity: number) {
		const index = cart.findIndex((line) => line.productId === productId);
		if (quantity <= 0) {
			if (index >= 0) cart.splice(index, 1);
		} else if (index >= 0) cart[index].quantity = quantity;
		else cart.push({ productId, quantity });
	}

	const shown = $derived.by(() => {
		const words = search.trim().toLowerCase();
		return shop.products.filter(
			(product) =>
				(category === null || product.categoryId === category) &&
				(!words ||
					product.name.toLowerCase().includes(words) ||
					product.sku.toLowerCase().includes(words)),
		);
	});
	const byCategory = $derived(
		shop.categories
			.map((each) => ({
				...each,
				products: shown.filter((product) => product.categoryId === each.id),
			}))
			.filter((each) => each.products.length),
	);
	const lines = $derived(
		cart.flatMap((line) => {
			const product = shop.products.find((each) => each.id === line.productId);
			return product ? [{ product, quantity: line.quantity }] : [];
		}),
	);
	const total = $derived(
		lines.reduce((sum, line) => sum + lineAmount(line.quantity, line.product.price), 0),
	);
	const count = $derived(lines.reduce((sum, line) => sum + line.quantity, 0));
</script>

<svelte:head>
	<title>{m.shop_portal_title()}</title>
</svelte:head>

<div class="flex flex-wrap items-start justify-between gap-3">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold tracking-tight">{m.shop_portal_title()}</h1>
		<p class="text-sm text-muted-foreground">{m.shop_portal_description()}</p>
	</div>
	<Button variant="outline" href={resolve("/(customer)/(modules)/parts-shop/portal/orders")}>
		{m.shop_client_orders_title()}
	</Button>
</div>

{#if shop.partner}
	<p class="text-sm" data-shop-credit>
		{m.shop_portal_credit({ available: formatCents(shop.available) })}
	</p>
{/if}

{#if shop.low}
	<div
		class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
		role="status"
		data-low-stock-banner
	>
		<TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
		{m.shop_low_banner({ count: shop.low })}
	</div>
{/if}

<!-- On a wide screen the cart is beside the catalogue, and stays in view while scrolling it. -->
<div
	class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
>
	<div class="@container flex min-w-0 flex-col gap-6">
		<div class="flex flex-col gap-3">
			<InputGroup.Root>
				<InputGroup.Addon><SearchIcon /></InputGroup.Addon>
				<InputGroup.Input
					type="search"
					placeholder={m.shop_search()}
					aria-label={m.shop_search()}
					bind:value={search}
				/>
			</InputGroup.Root>
			<nav class="flex flex-wrap gap-2" aria-label={m.shop_field_category()}>
				<Button
					size="sm"
					variant={category === null ? "default" : "outline"}
					aria-pressed={category === null}
					onclick={() => (category = null)}
				>
					{m.shop_categories_all()}
				</Button>
				{#each shop.categories as each (each.id)}
					<Button
						size="sm"
						variant={category === each.id ? "default" : "outline"}
						aria-pressed={category === each.id}
						onclick={() => (category = each.id)}
						data-category={each.name}
					>
						{each.name}
					</Button>
				{/each}
			</nav>
		</div>

		{#each byCategory as each (each.id)}
			<section
				class="flex flex-col gap-3"
				aria-label={each.name}
				data-catalogue-category={each.name}
			>
				<h2 class="text-sm font-medium text-muted-foreground">
					{each.name} <span class="tabular-nums">· {formatNumber(each.products.length)}</span>
				</h2>
				<div class="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-3">
					{#each each.products as product (product.id)}
						<ProductCard
							{product}
							quantity={quantityOf(product.id)}
							onchange={(quantity) => setQuantity(product.id, quantity)}
						/>
					{/each}
				</div>
			</section>
		{:else}
			<Empty.Root class="border" data-catalogue-empty>
				<Empty.Header>
					<Empty.Title>{m.shop_catalogue_empty()}</Empty.Title>
					<Empty.Description>{m.shop_catalogue_empty_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/each}
	</div>

	<div class="lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto">
		<Checkout
			{lines}
			available={shop.available}
			partner={shop.partner}
			onremove={(productId) => setQuantity(productId, 0)}
		/>
	</div>
</div>

{#if count}
	<a
		href="#checkout"
		class="sticky bottom-4 z-10 flex items-center justify-between gap-3 self-stretch rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg sm:hidden"
		data-cart-bar
	>
		<span>{m.shop_cart_count({ count })}</span>
		<span class="tabular-nums">{formatCents(total)}</span>
	</a>
{/if}
