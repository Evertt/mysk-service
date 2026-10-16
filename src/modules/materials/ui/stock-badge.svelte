<!--
	@component
	The stock level of a material (out of stock, low, in stock) as a badge.
-->
<script lang="ts">
	import { stockLevel, stockLevelDisplay } from "../display.ts";
	import type { MaterialUnit } from "../model.ts";

	let { stock, unit }: { stock: number; unit: MaterialUnit } = $props();

	const display = $derived(stockLevelDisplay[stockLevel(stock, unit)]);
</script>

<Badge variant={display.tone}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
