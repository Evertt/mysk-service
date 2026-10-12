<!--
	@component
	What the range filters (`DateRangeFilter`, `NumberRangeFilter`) have in common: the column's
	values (its tokens in the URL, see `ranges.ts`), registered with the table's `Toolbar` like any
	filter, and their content: the values chosen, each with a button that takes it off; the rows
	without a value (`none`) and the `presets` to pick from, if any; and a form to add a range of
	one's own, whose `ends` the filter renders and whose range is `custom` (the URL's token, once
	it is one). At most `listLimits.ranges` values, as the list's query takes no more: then nothing
	more can be added, and the form says so. Renders nothing of its own.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import type { Snippet } from "svelte";

	import { formatNumber } from "#lib/i18n/format.ts";
	import { cn } from "#lib/utils.ts";

	import { registerTableFilter } from "./filters.svelte.ts";
	import { listLimits } from "./list-definition.ts";
	import RangeValues from "./range-values.svelte";
	import { useTableContext } from "./table.svelte.ts";
	import { noneToken } from "./url-state.ts";

	let {
		columnId,
		title,
		labelOf,
		none,
		presets = [],
		heading,
		ends,
		custom,
		onadded,
	}: {
		columnId: string;
		title: string;
		/** What a value is called, e.g. "This week" or "At most 10". */
		labelOf: (token: string) => string;
		/** For a column that can be empty: offers its rows without a value first, with this label. */
		none?: string;
		/** Values to pick in one click, with a hint of what they mean, e.g. this week's days. */
		presets?: readonly { token: string; label: string; hint?: string }[];
		/** Above the form, if anything. */
		heading?: string;
		/** The form's inputs, for the ends of a range of one's own. */
		ends: Snippet;
		/** The range the inputs make, as the URL's token, if they make one. */
		custom: string | undefined;
		/** Called once the inputs' range is added, to empty them. */
		onadded: () => void;
	} = $props();

	const table = useTableContext();
	const column = $derived(table.getColumn(columnId));
	/** The filter's values, their tokens in the URL. */
	const tokens = $derived((column?.getFilterValue() as string[] | undefined) ?? []);
	/** Whether the filter has as many values as the list takes. */
	const full = $derived(tokens.length >= listLimits.ranges);

	function set(next: readonly string[]) {
		column?.setFilterValue(next.length ? [...next] : undefined);
	}
	function toggle(token: string) {
		if (tokens.includes(token)) set(tokens.filter((t) => t !== token));
		else if (!full) set([...tokens, token]);
	}

	function add(event: SubmitEvent) {
		event.preventDefault();
		if (!custom || full) return;
		if (!tokens.includes(custom)) set([...tokens, custom]);
		onadded();
	}

	/** What's offered in one click: the rows without a value, then the presets. */
	const options = $derived([
		...(none ? [{ token: noneToken, label: none, hint: undefined }] : []),
		...presets,
	]);

	registerTableFilter({
		get columnId() {
			return columnId;
		},
		get title() {
			return title;
		},
		get chosen() {
			return tokens.map(labelOf);
		},
		content,
		clear: () => set([]),
	});
</script>

{#snippet content()}
	<RangeValues
		values={tokens.map((token) => ({ token, label: labelOf(token) }))}
		onremove={toggle}
	/>
	{#if options.length}
		<!-- With presets, they're what the Filter menu focuses (see `filter-menu.svelte`). -->
		<Command.Root data-filter-autofocus={presets.length ? "" : undefined}>
			<Command.List>
				<Command.Group>
					{#each options as option (option.token)}
						{@const chosen = tokens.includes(option.token)}
						<Command.Item
							value={option.token}
							disabled={full && !chosen}
							onSelect={() => toggle(option.token)}
						>
							<CheckIcon class={cn("size-4", !chosen && "invisible")} />
							<span class="truncate">{option.label}</span>
							{#if option.hint}
								<Command.Shortcut class="shrink-0">{option.hint}</Command.Shortcut>
							{/if}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
		<Separator />
	{/if}
	<form class="flex flex-col gap-3 p-3" onsubmit={add}>
		{#if heading}
			<span class="text-xs font-medium text-muted-foreground">{heading}</span>
		{/if}
		<div class="grid grid-cols-2 gap-2">
			{@render ends()}
		</div>
		{#if full}
			<p class="text-xs text-muted-foreground" data-testid="range-filter-full">
				{m.common_table_range_full({ max: formatNumber(listLimits.ranges) })}
			</p>
		{/if}
		<div class="flex justify-end gap-2">
			{#if tokens.length}
				<Button type="button" variant="ghost" size="sm" onclick={() => set([])}>
					{m.common_table_filter_clear()}
				</Button>
			{/if}
			<Button type="submit" size="sm" disabled={!custom || full}>
				{m.common_table_range_add()}
			</Button>
		</div>
	</form>
{/snippet}
