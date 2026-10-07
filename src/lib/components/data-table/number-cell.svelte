<!--
	@component
	A right-aligned count or quantity, muted when zero, optionally with a unit through a plural
	message that takes the `count`: `renderComponent(cell.NumberCell, { format: m.common_count_orders })`
	→ "1 order", "3 orders" (in Dutch "1 opdracht", "3 opdrachten").
-->
<script lang="ts">
	import { formatNumber } from "#lib/format.js";
	import { cn } from "#lib/utils.js";

	import { useCellContext } from "./table.svelte.js";

	let { format }: { format?: (inputs: { count: number }) => string } = $props();

	const cell = useCellContext<number>();
	const value = $derived(cell.getValue() ?? 0);
</script>

<div
	class={cn("text-right whitespace-nowrap tabular-nums", value === 0 && "text-muted-foreground")}
>
	{format ? format({ count: value }) : formatNumber(value)}
</div>
