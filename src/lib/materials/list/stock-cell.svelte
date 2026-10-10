<!--
	@component
	A material's stock, right-aligned, with a badge when it's low or out.
-->
<script lang="ts">
	import type { MaterialUnit } from "#lib/models.ts";

	import { formatQuantity, stockLevel } from "../display.ts";
	import StockBadge from "../ui/stock-badge.svelte";

	let { stock, unit }: { stock: number; unit: MaterialUnit } = $props();
</script>

<div class="flex items-center justify-end gap-2 whitespace-nowrap">
	{#if stockLevel(stock, unit) !== "in_stock"}
		<StockBadge {stock} {unit} />
	{/if}
	<span class="tabular-nums">{formatQuantity(stock, unit)}</span>
</div>
