<!--
	@component
	A material's stock, right-aligned, with a badge when it's low or out.
-->
<script lang="ts">
	import EnumBadge from "#lib/components/enum-badge.svelte";

	import { formatQuantity, stockLevel, stockLevelDisplay } from "../display.ts";
	import type { MaterialUnit } from "../model.ts";

	let { stock, unit }: { stock: number; unit: MaterialUnit } = $props();

	const level = $derived(stockLevel(stock, unit));
</script>

<div class="flex items-center justify-end gap-2 whitespace-nowrap">
	{#if level !== "in_stock"}
		<EnumBadge display={stockLevelDisplay} value={level} />
	{/if}
	<span class="tabular-nums">{formatQuantity(stock, unit)}</span>
</div>
