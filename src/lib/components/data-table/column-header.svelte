<!--
	@component
	Column header that sorts its column when clicked; plain text for a column that can't be sorted.

	A click (or Enter or Space) takes the column to its next direction and sorts by it alone:
	ascending, descending, then unsorted. Shift-, Cmd- or Ctrl-clicking (or Shift+Enter) does the
	same within a sort by several columns, adding the column to it, turning it around there or taking
	it out. With more than one column sorted, each shows its place in the order.
-->
<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";

	import { formatNumber } from "#lib/format.js";
	import { cn } from "#lib/utils.js";

	import { columnLabel } from "./features.js";
	import { isMultiSortEvent, useHeaderContext, useTableContext } from "./table.svelte.js";

	const header = useHeaderContext();
	const table = useTableContext();
	const column = $derived(header.column);
	const meta = $derived(column.columnDef.meta);
	const label = $derived(columnLabel(column));
	const sorted = $derived(column.getIsSorted());
	const sortCount = $derived(table.atoms.sorting.get().length);
	/** 1 for the column sorted by first, when more than one is. */
	const position = $derived(sorted && sortCount > 1 ? column.getSortIndex() + 1 : undefined);

	/** Sorts by the column alone, or within the sort if the event says so (`isMultiSortEvent`). */
	const toggle = (event: Event) => column.getToggleSortingHandler()?.(event);
</script>

{#if !column.getCanSort()}
	<span class={cn(meta?.align === "end" && "block text-right")}>{label}</span>
{:else}
	<div class={cn("flex", meta?.align === "end" && "justify-end")}>
		<Button
			variant="ghost"
			size="sm"
			class="-mx-2.5"
			title={m.common_table_sort_hint()}
			onclick={toggle}
			onkeydown={(event: KeyboardEvent) => {
				// The click a button makes of Enter or Space doesn't say which keys were held.
				if (isMultiSortEvent(event) && (event.key === "Enter" || event.key === " ")) {
					event.preventDefault();
					toggle(event);
				}
			}}
		>
			{label}
			{#if sorted === "desc"}
				<ArrowDownIcon data-icon="inline-end" />
			{:else if sorted === "asc"}
				<ArrowUpIcon data-icon="inline-end" />
			{:else}
				<ChevronsUpDownIcon data-icon="inline-end" class="text-muted-foreground" />
			{/if}
			{#if position}
				<span aria-hidden="true" class="-ml-1 text-xs text-muted-foreground tabular-nums">
					{formatNumber(position)}
				</span>
			{/if}
			{#if sorted}
				<span class="sr-only">
					{sorted === "asc"
						? m.common_table_sorted_ascending()
						: m.common_table_sorted_descending()}{#if position}, {m.common_table_sort_position({
							position: formatNumber(position),
							total: formatNumber(sortCount),
						})}{/if}
				</span>
			{/if}
		</Button>
	</div>
{/if}
