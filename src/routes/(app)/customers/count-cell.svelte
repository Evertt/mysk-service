<!--
	@component
	Right-aligned count for a numeric column; zero is muted.
-->
<script lang="ts">
	import { useCellContext } from "#lib/components/data-table/table.svelte.js";

	const cell = useCellContext<number>();
	const value = $derived(cell.getValue());
</script>

<div class={["text-right tabular-nums", !value && "text-muted-foreground"]}>{value}</div>
