<!--
	@component
	Column header with a menu to sort or hide the column. Falls back to plain text for columns
	that can do neither.

	Sorting from the menu sorts by this column alone. Shift-, Cmd- or Ctrl-clicking the header (or
	Shift+Enter) adds the column to the sort instead, or takes it to its next direction there:
	ascending, descending, then out of the sort; the same keys with a menu item add it in that
	direction. With more than one column sorted, each shows its place in the order.
-->
<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import XIcon from "@lucide/svelte/icons/x";

	import { formatNumber } from "#lib/format.js";
	import { cn } from "#lib/utils.js";

	import { columnLabel } from "./features.js";
	import { isMultiSortEvent, useHeaderContext, useTableContext } from "./table.svelte.js";

	const header = useHeaderContext();
	const table = useTableContext();
	const column = $derived(header.column);
	const meta = $derived(column.columnDef.meta);
	const label = $derived(columnLabel(column));
	const canSort = $derived(column.getCanSort());
	const sorted = $derived(column.getIsSorted());
	const sortCount = $derived(table.atoms.sorting.get().length);
	/** 1 for the column sorted by first, when more than one is. */
	const position = $derived(sorted && sortCount > 1 ? column.getSortIndex() + 1 : undefined);

	/** Whether a key held while choosing a menu item adds the column to the sort. */
	let addKey = false;

	function sort(desc: boolean, event: Event) {
		column.toggleSorting(desc, addKey || isMultiSortEvent(event));
	}
</script>

{#if !canSort && !column.getCanHide()}
	<span class={cn(meta?.align === "end" && "block text-right")}>{label}</span>
{:else}
	<div class={cn("flex", meta?.align === "end" && "justify-end")}>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="sm"
						class="-mx-2.5"
						title={canSort ? m.common_table_sort_hint() : undefined}
						onpointerdown={(event: PointerEvent) => {
							// Adding to the sort doesn't open the menu.
							if (canSort && isMultiSortEvent(event)) event.preventDefault();
							else (props.onpointerdown as (event: PointerEvent) => void)?.(event);
						}}
						onclick={(event: MouseEvent) => {
							if (canSort && isMultiSortEvent(event)) column.getToggleSortingHandler()?.(event);
							else (props.onclick as (event: MouseEvent) => void)?.(event);
						}}
						onkeydown={(event: KeyboardEvent) => {
							if (canSort && event.shiftKey && (event.key === "Enter" || event.key === " ")) {
								event.preventDefault();
								column.getToggleSortingHandler()?.(event);
							} else (props.onkeydown as (event: KeyboardEvent) => void)?.(event);
						}}
					>
						{label}
						{#if sorted === "desc"}
							<ArrowDownIcon data-icon="inline-end" />
						{:else if sorted === "asc"}
							<ArrowUpIcon data-icon="inline-end" />
						{:else if canSort}
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
									: m.common_table_sorted_descending()}{#if position}, {m.common_table_sort_position(
										{ position: formatNumber(position), total: formatNumber(sortCount) },
									)}{/if}
							</span>
						{/if}
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				align={meta?.align === "end" ? "end" : "start"}
				class="min-w-36"
				onkeydowncapture={(event: KeyboardEvent) => {
					// Choosing an item with the keyboard clicks it without the keys held.
					addKey = event.shiftKey || event.metaKey || event.ctrlKey;
				}}
				onpointerdowncapture={() => (addKey = false)}
			>
				{#if canSort}
					<DropdownMenu.Group>
						<DropdownMenu.Item onclick={(event: MouseEvent) => sort(false, event)}>
							<ArrowUpIcon />
							{m.common_table_sort_ascending()}
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={(event: MouseEvent) => sort(true, event)}>
							<ArrowDownIcon />
							{m.common_table_sort_descending()}
						</DropdownMenu.Item>
						{#if sorted}
							<DropdownMenu.Item onclick={() => column.clearSorting()}>
								<XIcon />
								{m.common_table_sort_clear()}
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Group>
				{/if}
				{#if canSort && column.getCanHide()}
					<DropdownMenu.Separator />
				{/if}
				{#if column.getCanHide()}
					<DropdownMenu.Group>
						<DropdownMenu.Item onclick={() => column.toggleVisibility(false)}>
							<EyeOffIcon />
							{m.common_table_hide_column()}
						</DropdownMenu.Item>
					</DropdownMenu.Group>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
{/if}
