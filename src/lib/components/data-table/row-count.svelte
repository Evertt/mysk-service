<!--
	@component
	In the table's toolbar: how many rows match (all of them, not just those loaded as the table
	scrolls), and how many are selected.
-->
<script lang="ts">
	import { formatNumber } from "#lib/i18n/index.ts";

	import { useTableContext } from "./table.svelte.ts";

	const table = useTableContext();
	const selectedCount = $derived(table.getFilteredSelectedRowModel().rows.length);
	// All the rows that match (for a server-side table, as the server counted them).
	const filteredCount = $derived(table.getRowCount());
</script>

<p data-slot="data-table-count" class="text-sm whitespace-nowrap text-muted-foreground">
	{#if selectedCount}
		{m.common_table_rows_selected({
			selected: formatNumber(selectedCount),
			count: filteredCount,
		})}
	{:else}
		{m.common_table_rows({ count: filteredCount })}
	{/if}
</p>
