<!--
	@component
	Right-aligned amount for a column whose value is in cents.
-->
<script lang="ts">
	import { formatCents } from "#lib/i18n/index.ts";

	import { useCellContext } from "./table.svelte.ts";

	const cell = useCellContext<number>();
</script>

<div class="text-right whitespace-nowrap tabular-nums">{formatCents(cell.getValue())}</div>
