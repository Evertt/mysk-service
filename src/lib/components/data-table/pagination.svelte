<script lang="ts">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import ChevronsLeftIcon from "@lucide/svelte/icons/chevrons-left";
	import ChevronsRightIcon from "@lucide/svelte/icons/chevrons-right";

	import { formatNumber } from "#lib/i18n";

	import { useTableContext } from "./table.svelte.ts";
	import { defaultPageSizes } from "./url-state.ts";

	/** The sizes to choose from; a table with other ones also passes them to `urlState`. */
	let { pageSizes = defaultPageSizes }: { pageSizes?: readonly number[] } = $props();

	const table = useTableContext();
	const pagination = $derived(table.atoms.pagination.get());
	const selectedCount = $derived(table.getFilteredSelectedRowModel().rows.length);
	// All the rows that match, on every page (for a server-side table, as the server counted them).
	const filteredCount = $derived(table.getRowCount());
</script>

<div class="flex flex-wrap items-center justify-between gap-4">
	<p class="text-sm text-muted-foreground">
		{#if selectedCount}
			{m.common_table_rows_selected({
				selected: formatNumber(selectedCount),
				count: filteredCount,
			})}
		{:else}
			{m.common_table_rows({ count: filteredCount })}
		{/if}
	</p>
	<div class="flex flex-wrap items-center gap-4 lg:gap-8">
		<div class="flex items-center gap-2">
			<span class="text-sm font-medium">{m.common_table_rows_per_page()}</span>
			<Select.Root
				type="single"
				value={String(pagination.pageSize)}
				onValueChange={(value) => table.setPageSize(Number(value))}
			>
				<Select.Trigger size="sm" class="w-20" aria-label={m.common_table_rows_per_page()}>
					{pagination.pageSize}
				</Select.Trigger>
				<Select.Content side="top">
					<Select.Group>
						{#each pageSizes as size (size)}
							<Select.Item value={String(size)} label={String(size)} />
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		</div>
		<span class="text-sm font-medium">
			{m.common_table_page({
				page: formatNumber(pagination.pageIndex + 1),
				pages: formatNumber(Math.max(table.getPageCount(), 1)),
			})}
		</span>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="icon-sm"
				class="hidden lg:inline-flex"
				aria-label={m.common_table_first_page()}
				disabled={!table.getCanPreviousPage()}
				onclick={() => table.firstPage()}
			>
				<ChevronsLeftIcon />
			</Button>
			<Button
				variant="outline"
				size="icon-sm"
				aria-label={m.common_table_previous_page()}
				disabled={!table.getCanPreviousPage()}
				onclick={() => table.previousPage()}
			>
				<ChevronLeftIcon />
			</Button>
			<Button
				variant="outline"
				size="icon-sm"
				aria-label={m.common_table_next_page()}
				disabled={!table.getCanNextPage()}
				onclick={() => table.nextPage()}
			>
				<ChevronRightIcon />
			</Button>
			<Button
				variant="outline"
				size="icon-sm"
				class="hidden lg:inline-flex"
				aria-label={m.common_table_last_page()}
				disabled={!table.getCanNextPage()}
				onclick={() => table.lastPage()}
			>
				<ChevronsRightIcon />
			</Button>
		</div>
	</div>
</div>
