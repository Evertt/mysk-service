<!--
	@component
	Right-aligned amount for a column whose value is in cents.
-->
<script lang="ts">
	import { formatCents } from "#lib/format.js";

	import { useCellContext } from "./table.svelte.js";

	const cell = useCellContext<number>();
</script>

<div class="text-right whitespace-nowrap tabular-nums">{formatCents(cell.getValue())}</div>
