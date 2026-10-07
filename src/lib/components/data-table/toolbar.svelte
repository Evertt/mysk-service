<!--
	@component
	Search, filters (`children`, e.g. `FacetedFilter`s), a reset button when anything is filtered,
	extra `actions` and the column visibility menu.
-->
<script lang="ts">
	import SearchIcon from "@lucide/svelte/icons/search";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";

	import { useTableContext } from "./table.svelte.js";

	let {
		searchLabel = m.common_table_search(),
		children,
		actions,
	}: { searchLabel?: string; children?: Snippet; actions?: Snippet } = $props();

	const table = useTableContext();
	const globalFilter = $derived(table.atoms.globalFilter.get() ?? "");
	const isFiltered = $derived(table.atoms.columnFilters.get().length > 0 || globalFilter !== "");
</script>

<div class="flex flex-wrap items-center gap-2">
	<InputGroup.Root class="w-full sm:w-64">
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
	{#if isFiltered}
		<Button
			variant="ghost"
			size="sm"
			onclick={() => {
				table.resetColumnFilters();
				table.resetGlobalFilter();
			}}
		>
			{m.common_table_reset()}
			<XIcon data-icon="inline-end" />
		</Button>
	{/if}
	<div class="ml-auto flex items-center gap-2">
		{@render actions?.()}
		<table.ViewOptions />
	</div>
</div>
