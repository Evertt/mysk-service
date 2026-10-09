<!--
	@component
	The toolbar's Filter button: a popover that lists the table's filters (see `filters.svelte.ts`)
	and, once one is picked, shows its values to choose from in place, with a way back to the list.
-->
<script lang="ts">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import ListFilterIcon from "@lucide/svelte/icons/list-filter";
	import { tick } from "svelte";
	import type { Attachment } from "svelte/attachments";

	import { cn } from "#lib/utils.ts";

	import type { TableFilter, TableFilters } from "./filters.svelte.ts";

	let { filters }: { filters: TableFilters } = $props();

	/** The filter whose values are shown instead of the list. */
	let picked = $state<TableFilter>();
	let list = $state<HTMLElement | null>(null);

	/** Focuses the list, so the arrow keys move through it (once it's there). */
	async function focusList() {
		await tick();
		list?.focus();
	}

	/** On the picked filter's values: focuses their search box. */
	const focusSearch: Attachment = (node) => {
		node.querySelector<HTMLElement>("input")?.focus();
	};

	function summary(filter: TableFilter) {
		return filter.chosen.length > 2
			? m.common_table_filter_selected({ count: filter.chosen.length })
			: filter.chosen.join(", ");
	}
</script>

<Popover.Root
	onOpenChange={(isOpen) => {
		if (!isOpen) picked = undefined;
	}}
>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm">
				<ListFilterIcon data-icon="inline-start" />
				{m.common_table_filter()}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		class="w-72 gap-0 p-0"
		align="start"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			void focusList();
		}}
	>
		{#if picked}
			<div class="flex items-center gap-1 border-b p-1">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={m.common_table_filter_back()}
					onclick={() => {
						picked = undefined;
						void focusList();
					}}
				>
					<ChevronLeftIcon />
				</Button>
				<span class="text-sm font-medium">{picked.title}</span>
			</div>
			<div {@attach focusSearch}>
				{@render picked.content()}
			</div>
		{/if}
		<!-- Hidden, not gone, while a filter is picked: were the focused list taken out, the popover
		     would move the focus to its first button (the one back to the list). -->
		<Command.Root bind:ref={list} class={cn(picked && "hidden")}>
			<Command.List>
				<Command.Group>
					{#each filters.all as filter (filter.columnId)}
						<Command.Item value={filter.columnId} onSelect={() => (picked = filter)}>
							<span class="truncate">{filter.title}</span>
							<Command.Shortcut class="max-w-32 truncate tracking-wide">
								{#if filter.chosen.length}
									{summary(filter)}
								{/if}
							</Command.Shortcut>
							<ChevronRightIcon />
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
