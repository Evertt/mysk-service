<!--
	@component
	A right-aligned count or quantity, muted when zero, with an optional unit:
	`renderComponent(cell.NumberCell, { unit: "order" })` → "1 order", "3 orders";
	`{ unit: "h", plural: "h" }` → "24 h".
-->
<script lang="ts">
	import { cn } from "#lib/utils.js";

	import { useCellContext } from "./table.svelte.js";

	let { unit, plural }: { unit?: string; plural?: string } = $props();

	const cell = useCellContext<number>();
	const value = $derived(cell.getValue() ?? 0);
	const suffix = $derived(unit && (value === 1 ? unit : (plural ?? `${unit}s`)));
</script>

<div
	class={cn("text-right whitespace-nowrap tabular-nums", value === 0 && "text-muted-foreground")}
>
	{value}{suffix ? ` ${suffix}` : ""}
</div>
