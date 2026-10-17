<!--
	@component
	The cart and its checkout in the portal ("Afrekenen met Parts Credit"): its lines and total
	excluding VAT, the credit available, the order's total taken off it, and what's left after
	("Saldo na bestelling"), in red with a warning when it would go below zero. Paying is only
	possible with something in the cart and enough credit; the server checks it all again.
-->
<script lang="ts">
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { formatCents, formatNumber } from "#lib/i18n/index.ts";
	import { cn } from "#lib/utils.ts";

	import { balanceAfter, lineAmount } from "../model.ts";
	import { placeClientShopOrder } from "./client-shop.remote.ts";

	interface Line {
		product: { id: number; sku: string; name: string; price: number };
		quantity: number;
	}

	let {
		lines,
		available,
		partner,
		onremove,
	}: {
		lines: Line[];
		available: number;
		partner: boolean;
		onremove: (productId: number) => void;
	} = $props();

	const total = $derived(
		lines.reduce((sum, line) => sum + lineAmount(line.quantity, line.product.price), 0),
	);
	const after = $derived(balanceAfter(available, total));
	const fields = $derived(placeClientShopOrder.fields);

	function withoutValue<T extends { value?: unknown }>({ value: _value, ...attributes }: T) {
		return attributes;
	}
</script>

<Card.Root id="checkout" data-checkout>
	<Card.Header>
		<Card.Title>{m.shop_checkout_title()}</Card.Title>
		<Card.Description>{m.shop_checkout_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form {...placeClientShopOrder} class="flex flex-col gap-4">
			{#if lines.length}
				<ul class="flex flex-col divide-y text-sm" data-cart>
					{#each lines as line, index (line.product.id)}
						<li
							class="flex items-center justify-between gap-3 py-2"
							data-cart-line={line.product.sku}
						>
							<input
								{...withoutValue(fields.lines[index].productId.as("hidden", ""))}
								value={String(line.product.id)}
							/>
							<input
								{...withoutValue(fields.lines[index].quantity.as("hidden", ""))}
								value={String(line.quantity)}
							/>
							<span class="flex min-w-0 flex-col">
								<span class="truncate font-medium">{line.product.name}</span>
								<span class="text-xs text-muted-foreground tabular-nums">
									{formatNumber(line.quantity)} × {formatCents(line.product.price)}
								</span>
							</span>
							<span class="flex shrink-0 items-center gap-2">
								<span class="tabular-nums"
									>{formatCents(lineAmount(line.quantity, line.product.price))}</span
								>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									aria-label={m.shop_cart_remove({ name: line.product.name })}
									onclick={() => onremove(line.product.id)}
								>
									{m.shop_cart_remove_short()}
								</Button>
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground" data-cart-empty>{m.shop_cart_empty()}</p>
			{/if}

			<dl class="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
				<div class="flex justify-between gap-2">
					<dt>{m.shop_checkout_available()}</dt>
					<dd class="tabular-nums" data-checkout-available>{formatCents(available)}</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt>{m.shop_checkout_order()}</dt>
					<dd class="tabular-nums" data-checkout-total>– {formatCents(total)}</dd>
				</div>
				<div class="flex justify-between gap-2 border-t pt-2 font-semibold">
					<dt>{m.shop_checkout_after()}</dt>
					<dd class={cn("tabular-nums", after < 0 && "text-destructive")} data-checkout-after>
						{formatCents(after)}
					</dd>
				</div>
			</dl>
			<p class="text-xs text-muted-foreground">{m.shop_checkout_vat()}</p>
			{#if !partner}
				<p class="text-sm text-destructive" data-checkout-not-partner>
					{m.shop_checkout_not_partner()}
				</p>
			{:else if after < 0}
				<p class="text-sm text-destructive" data-checkout-short>{m.shop_checkout_short()}</p>
			{/if}
			<Field.FieldError errors={placeClientShopOrder.fields.allIssues()} />
			<SubmitButton
				size="lg"
				pending={placeClientShopOrder.pending}
				disabled={!partner || !lines.length || after < 0}
			>
				{m.shop_checkout_pay()}
			</SubmitButton>
		</form>
	</Card.Content>
</Card.Root>
