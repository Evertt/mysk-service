<!--
	@component
	The parts shop under an order's checklist results in the customer portal
	(`checklists.client.rejected`): the part a rejected point needs, and for a partner with credit to
	spend the way to order it in the shop ("Bestel in de shop"), with the part in the cart. Nothing
	when no product fixes the points.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";

	import { formatCents } from "#lib/i18n/index.ts";
	import type { RejectedPoint } from "#modules/checklists/api/extensions.ts";

	import { getClientSuggestedParts } from "../../suggestions/suggested-parts.remote.ts";
	import StockBadge from "../../ui/stock-badge.svelte";

	let { rejected }: { number: string; rejected: RejectedPoint[] } = $props();

	const ids = $derived(
		[...new Set(rejected.map((point) => point.templateItemId))].sort((a, b) => a - b),
	);
	const data = $derived(await getClientSuggestedParts(ids));
</script>

{#if data.parts.length}
	<Card.Root data-client-suggested-parts>
		<Card.Header>
			<Card.Title>{m.shop_suggested_title()}</Card.Title>
			<Card.Description>{m.shop_client_suggested_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col divide-y">
			{#each data.parts as part (part.id)}
				{@const points = rejected.filter((point) => part.points.includes(point.templateItemId))}
				<article
					class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
					data-suggested-part={part.sku}
				>
					<div class="flex items-start justify-between gap-2">
						<div class="flex min-w-0 flex-col">
							<span class="font-medium">{part.name}</span>
							<span class="text-xs text-muted-foreground">
								{part.sku} · {m.shop_price_excl_vat({ price: formatCents(part.price) })}
							</span>
						</div>
						<StockBadge availability={part.availability} />
					</div>
					<ul class="flex flex-col gap-0.5 text-xs text-muted-foreground">
						{#each points as point, i (i)}
							<li>{point.unit}: {point.text}</li>
						{/each}
					</ul>
					{#if data.credit > 0 && part.orderable && part.availability !== "on_request"}
						<Button
							size="sm"
							class="self-start"
							href="{resolve('/(customer)/(modules)/parts-shop/portal')}?add={part.id}"
							data-order-in-shop
						>
							<ShoppingCartIcon data-icon="inline-start" />
							{m.shop_order_in_shop()}
						</Button>
					{/if}
				</article>
			{/each}
		</Card.Content>
	</Card.Root>
{/if}
