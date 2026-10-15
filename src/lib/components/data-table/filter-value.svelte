<!--
	@component
	A value in a table's cell that filters the table by it when clicked (see `cell-filter.svelte.ts`):
	a button around what the cell shows, with a faint background on hover and "Filter by …" as its
	name and tooltip. The table wraps the cells of a column with `meta.clickFilter` in one; a cell
	with more than one value (a city and its country) uses it for each.

	It's a real button, so it works with the keyboard and on touch; the table's row navigation only
	handles keys pressed on a row itself, and its size is what it wraps, so the columns' widths don't
	change.
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	import { cn } from "#lib/utils.ts";

	import { cellFilter, type ValueFilter } from "./cell-filter.svelte.ts";

	let {
		filter,
		class: className,
		children,
	}: {
		filter: ValueFilter;
		class?: string;
		children: Snippet;
	} = $props();

	const by = cellFilter(() => filter);
</script>

<button
	type="button"
	class={cn(
		"-mx-1 -my-0.5 inline-flex max-w-[calc(100%+0.5rem)] cursor-pointer items-center rounded-sm px-1 py-0.5 text-left outline-none",
		"transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
		className,
	)}
	title={by.label}
	aria-label={by.label}
	data-slot="filter-value"
	onclick={by.toggle}
>
	{@render children()}
</button>
