<!--
	@component
	An active filter in the toolbar: its column and the chosen values (summed up when there are
	more than two), a popover with its values to change them, and a button that takes it off.
-->
<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";

	import type { TableFilter } from "./filters.svelte.ts";

	let { filter }: { filter: TableFilter } = $props();

	const summary = $derived(
		filter.chosen.length > 2
			? m.common_table_filter_selected({ count: filter.chosen.length })
			: filter.chosen.join(", "),
	);
</script>

<div data-slot="filter-pill" class="flex shrink-0 items-center">
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="sm" class="rounded-r-none">
					<span class="font-normal text-muted-foreground">{filter.title}</span>
					<span class="max-w-48 truncate">{summary}</span>
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-72 p-0" align="start">
			{@render filter.content()}
		</Popover.Content>
	</Popover.Root>
	<Button
		variant="outline"
		size="icon-sm"
		class="-ml-px rounded-l-none"
		aria-label={m.common_table_filter_remove({ title: filter.title })}
		onclick={() => filter.clear()}
	>
		<XIcon />
	</Button>
</div>
