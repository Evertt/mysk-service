<!--
	@component
	A primary value with a muted detail line below it, e.g. a name and its code. With `href` the
	primary value links there. Shows `fallback` in muted text when there's no primary value.

	In a table, either value can filter the table by it when clicked (`primaryFilter`,
	`secondaryFilter`; see `filter-value.svelte`), e.g. a customer's city (into the search box) and
	country (into its filter); a linked primary value keeps its link.
-->
<script lang="ts">
	import type { ValueFilter } from "./cell-filter.svelte.ts";
	import FilterValue from "./filter-value.svelte";

	let {
		primary,
		secondary,
		href,
		fallback = "—",
		primaryFilter,
		secondaryFilter,
	}: {
		primary?: string | null;
		secondary?: string | null;
		href?: string;
		fallback?: string;
		/** Clicking the primary value filters by this (not with `href`). */
		primaryFilter?: ValueFilter;
		/** Clicking the detail line filters by this. */
		secondaryFilter?: ValueFilter;
	} = $props();
</script>

{#if primary}
	<div class="flex max-w-64 flex-col items-start">
		{#if href}
			<a {href} class="max-w-full truncate font-medium underline-offset-4 hover:underline">
				{primary}
			</a>
		{:else if primaryFilter}
			<FilterValue filter={primaryFilter}><span class="truncate">{primary}</span></FilterValue>
		{:else}
			<span class="max-w-full truncate">{primary}</span>
		{/if}
		{#if secondary}
			{#if secondaryFilter}
				<FilterValue filter={secondaryFilter} class="text-xs text-muted-foreground">
					<span class="truncate">{secondary}</span>
				</FilterValue>
			{:else}
				<span class="max-w-full truncate text-xs text-muted-foreground">{secondary}</span>
			{/if}
		{/if}
	</div>
{:else}
	<span class="text-muted-foreground">{fallback}</span>
{/if}
