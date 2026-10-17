<!--
	@component
	The parts shop under the partner's wallet in the customer portal
	(`partner-programme.client.wallet`): the way to spend the credit ("Besteed Parts Credit"), while
	there's some to spend.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";

	let { available }: { available: number } = $props();
</script>

{#if available > 0}
	<Button href={resolve("/(customer)/(modules)/parts-shop/portal")} data-spend-credit>
		<ShoppingCartIcon data-icon="inline-start" />
		{m.shop_spend_credit()}
	</Button>
{/if}
