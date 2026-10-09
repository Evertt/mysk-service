<!--
	@component
	Search, a Filter button whose menu lists the filters (`children`: `FacetedFilter`s and
	`RecordFilter`s, which register themselves and render nothing), the active filters as pills in
	a row that scrolls sideways, a reset button when anything is filtered, extra `actions`, the
	saved views and the column visibility menu. One row on a desktop screen; on a phone the search
	box and the pills get rows of their own.
-->
<script lang="ts">
	import SearchIcon from "@lucide/svelte/icons/search";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";

	import FilterMenu from "./filter-menu.svelte";
	import FilterPill from "./filter-pill.svelte";
	import { provideTableFilters } from "./filters.svelte.ts";
	import { useTableContext } from "./table.svelte.ts";
	import ViewsMenu from "./views-menu.svelte";

	let {
		searchLabel = m.common_table_search(),
		children,
		actions,
	}: { searchLabel?: string; children?: Snippet; actions?: Snippet } = $props();

	const table = useTableContext();
	const filters = provideTableFilters();
	const globalFilter = $derived(table.atoms.globalFilter.get() ?? "");
	const isFiltered = $derived(table.atoms.columnFilters.get().length > 0 || globalFilter !== "");
</script>

<div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
	<InputGroup.Root class="w-full shrink-0 sm:w-64">
		<InputGroup.Addon>
			<SearchIcon />
		</InputGroup.Addon>
		<InputGroup.Input
			placeholder={searchLabel}
			aria-label={searchLabel}
			value={globalFilter}
			oninput={(event) => table.setGlobalFilter(event.currentTarget.value)}
		/>
	</InputGroup.Root>
	{@render children?.()}
	{#if filters.all.length}
		<FilterMenu {filters} />
	{/if}
	{#if isFiltered}
		<div
			class="order-last -my-1 flex min-w-0 flex-1 basis-full [scrollbar-width:thin] items-center gap-2 overflow-x-auto py-1 sm:order-none sm:basis-0"
		>
			{#each filters.active as filter (filter.columnId)}
				<FilterPill {filter} />
			{/each}
			<Button
				variant="ghost"
				size="sm"
				class="shrink-0"
				onclick={() => {
					table.resetColumnFilters();
					table.resetGlobalFilter();
				}}
			>
				{m.common_table_reset()}
				<XIcon data-icon="inline-end" />
			</Button>
		</div>
	{/if}
	<div class="ml-auto flex shrink-0 items-center gap-2">
		{@render actions?.()}
		<ViewsMenu />
		<table.ViewOptions />
	</div>
</div>
