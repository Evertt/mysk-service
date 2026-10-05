<!--
	@component
	The stock level of a material (out of stock, low, in stock) as a badge.
-->
<script lang="ts">
	import type { MaterialUnit } from "#lib/models.js";

	import { stockLevel, stockLevelDisplay } from "./display.js";

	let { stock, unit }: { stock: number; unit: MaterialUnit } = $props();

	const display = $derived(stockLevelDisplay[stockLevel(stock, unit)]);
</script>

<Badge variant={display.variant}>
	<display.icon data-icon="inline-start" />
	{display.label}
</Badge>
