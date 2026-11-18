<!--
	The parts shop in the customer portal ("Onderdelen Shop"): the catalogue by category, searched by
	name or article number, each product with its price excluding VAT, its stock and the checklist
	points it fixes; a banner when some run low; the cart and its checkout with Parts Credit under
	the catalogue, with a bar at the foot that leads to it while there's something in it. Its orders
	are behind the app bar's button. A link from a checklist's rejected point (`?add=<product>`) puts
	that product in the cart.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import ReceiptTextIcon from "@lucide/svelte/icons/receipt-text";
	import SearchIcon from "@lucide/svelte/icons/search";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import WalletCardsIcon from "@lucide/svelte/icons/wallet-cards";
	import { IsMounted, PersistedState } from "runed";
	import { onMount } from "svelte";

	import AppBar from "#lib/client/app-bar.svelte";
	import Callout from "#lib/components/callout.svelte";
	import FilterChips from "#lib/components/filter-chips.svelte";
	import { formatCents, formatDate, formatNumber } from "#lib/i18n/index.ts";
	import Checkout from "#modules/parts-shop/client/checkout.svelte";
	import { getClientShop } from "#modules/parts-shop/client/client-shop.remote.ts";
	import ProductCard from "#modules/parts-shop/client/product-card.svelte";
	import { isOrderable, lineAmount } from "#modules/parts-shop/model.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(customer)/(modules)/parts-shop/portal"> } = $props();

	const shop = $derived(await getClientShop());

	/**
	 * The cart: how many of each product, in the order they were added. It's kept for the tab's
	 * session, so it's still there after going to another page, and shown once mounted: the server
	 * renders it empty, as it can't read it.
	 */
	const stored = new PersistedState<{ productId: number; quantity: number }[]>(
		"parts-shop:cart",
		[],
		{ storage: "session" },
	);
	const mounted = new IsMounted();
	const cart = $derived(mounted.current ? stored.current : []);
	let search = $state("");
	let category = $state<number | null>(null);

	// A product a checklist's rejected point needs, put in the cart once (not again on a reload).
	onMount(() => {
		const toAdd = Number(page.url.searchParams.get("add"));
		const product = shop.products.find((each) => each.id === toAdd);
		const inCart = stored.current.some((line) => line.productId === toAdd);
		if (product && isOrderable(product) && product.availability !== "on_request" && !inCart) {
			setQuantity(toAdd, 1);
		}
	});

	const quantityOf = (productId: number) =>
		cart.find((line) => line.productId === productId)?.quantity ?? 0;

	function setQuantity(productId: number, quantity: number) {
		const lines = stored.current;
		const index = lines.findIndex((line) => line.productId === productId);
		if (quantity <= 0) {
			if (index >= 0) lines.splice(index, 1);
		} else if (index >= 0) lines[index].quantity = quantity;
		else lines.push({ productId, quantity });
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

<AppBar
	title={m.shop_portal_title()}
	back={{ href: resolve("/(customer)/portal/more"), label: m.client_tab_more() }}
>
	{#snippet actions()}
		<Button
			variant="ghost"
			size="icon"
			href={resolve("/(customer)/(modules)/parts-shop/portal/orders")}
			aria-label={m.shop_client_orders_title()}
		>
			<ReceiptTextIcon class="size-5" />
		</Button>
	{/snippet}
</AppBar>

<p class="px-1 text-[0.9375rem] text-muted-foreground">{m.shop_portal_description()}</p>

<!-- The partner's wallet, as the SHLTR mockup heads its shop: what's available, until when, and the
	way to the programme. -->
{#if shop.partner}
	<Callout icon={WalletCardsIcon} iconTile data-shop-credit>
		<span class="text-xs font-medium text-primary">{m.shop_portal_wallet()}</span>
		<span class="text-xl font-semibold tabular-nums">{formatCents(shop.available)}</span>
		{#snippet actions()}
			{#if shop.validUntil}
				<span class="text-xs text-muted-foreground">
					{m.shop_portal_wallet_valid({ date: formatDate(shop.validUntil) })}
				</span>
			{/if}
			<a
				href={resolve("/(customer)/(modules)/partner-programme/portal")}
				class="inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-4 hover:underline"
			>
				{m.shop_portal_wallet_programme()}
				<ArrowRightIcon class="size-3.5" />
			</a>
		{/snippet}
	</Callout>
{/if}

{#if shop.low}
	<Callout tone="warning" icon={TriangleAlertIcon} role="status" data-low-stock-banner>
		{m.shop_low_banner({ count: shop.low })}
	</Callout>
{/if}

<div class="flex flex-col gap-6">
	<div class="flex min-w-0 flex-col gap-6">
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
			<FilterChips
				class="-mx-4 [scrollbar-width:none] flex-nowrap overflow-x-auto px-4 *:shrink-0"
				label={m.shop_field_category()}
				options={shop.categories.map((each) => ({ value: String(each.id), label: each.name }))}
				value={category === null ? null : String(category)}
				all={{ label: m.shop_categories_all() }}
				onchange={(chosen) => (category = chosen === null ? null : Number(chosen))}
			/>
		</div>

		{#each byCategory as each (each.id)}
			<section
				class="flex flex-col gap-3"
				aria-label={each.name}
				data-catalogue-category={each.name}
			>
				<h2 class="section-label px-1">
					{each.name} <span class="tabular-nums">· {formatNumber(each.products.length)}</span>
				</h2>
				<div class="flex flex-col gap-3">
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
			<Empty.Root class="rounded-xl border bg-card" data-catalogue-empty>
				<Empty.Header>
					<Empty.Title>{m.shop_catalogue_empty()}</Empty.Title>
					<Empty.Description>{m.shop_catalogue_empty_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/each}
	</div>

	<div>
		<Checkout
			{lines}
			available={shop.available}
			partner={shop.partner}
			onremove={(productId) => setQuantity(productId, 0)}
			onplaced={() => (stored.current = [])}
		/>
	</div>
</div>

{#if count}
	<a
		href="#checkout"
		class="sticky bottom-[calc(var(--tab-bar-height)+0.75rem)] z-10 flex min-h-13 items-center justify-between gap-3 self-stretch rounded-xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-lg"
		data-cart-bar
	>
		<span>{m.shop_cart_count({ count })}</span>
		<span class="tabular-nums">{formatCents(total)}</span>
	</a>
{/if}
