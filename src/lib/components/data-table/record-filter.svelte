<!--
	@component
	Multi-select filter for a column of related records (a customer, an engineer, …), with more of
	them than fit in a list: the options come from the server as you type (`load`, the list's options
	query for the column, see `recordOptions()` and `facetOptions()`), which answers with a limited
	number of matches, each with how many of the list's rows have it under its search and other
	filters, most first; those no row has are greyed. The ticked ones are always shown, by name. The
	column's filter values are the records' codes (or ids), as in the URL, e.g.
	`?customer=CUST-0001,CUST-0007`. Its title is the column's label, and for a column that can be
	empty the rows without a value are an option too (`?engineer=none`), named by its `meta.none`
	(`ListToolbar` renders it for a list's set filter given a `load`). For a column with a few fixed values, see
	`FacetedFilter`.
	It goes inside the table's `Toolbar`, which lists it in its Filter menu and shows it as a pill
	while records are chosen; this component renders nothing of its own.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import { Debounced, resource } from "runed";
	import { untrack } from "svelte";
	import type { Attachment } from "svelte/attachments";
	import { SvelteMap } from "svelte/reactivity";

	import { formatNumber } from "#lib/i18n/format.ts";
	import { cn } from "#lib/utils.ts";

	import { filterColumn, registerTableFilter } from "./filters.svelte.ts";
	import { recordOptionsInOrder } from "./record-facets.ts";
	import type { LoadRecordOptions, RecordOption, RecordOptions } from "./server-table.svelte.ts";
	import { useTableContext } from "./table.svelte.ts";
	import { noneToken } from "./url-state.ts";

	let {
		columnId,
		title: givenTitle,
		searchLabel,
		load,
		none: givenNone,
	}: {
		columnId: string;
		/** The column's label if not given. */
		title?: string;
		/** The search box's placeholder and label, e.g. "Search customers…". */
		searchLabel: string;
		/**
		 * The options for a search, with their counts, and the names of the ticked ones: a new
		 * function when the list's other filters change (`recordOptions().current`), which fetches
		 * them again.
		 */
		load: LoadRecordOptions;
		/**
		 * For a column that can be empty: offers the rows without a value as the first option, with
		 * this label, e.g. "Unassigned". Its value is `none` in the URL (`noneToken`). The column's
		 * (`columnNone()`) if not given.
		 */
		none?: string | boolean;
	} = $props();

	/** How long typing waits before searching. */
	const searchDelay = 250;

	const table = useTableContext();
	const filter = filterColumn(table, () => ({ columnId, title: givenTitle, none: givenNone }));
	const column = $derived(filter.column);
	const title = $derived(filter.title);
	const none = $derived(filter.none);
	const selected = $derived((column?.getFilterValue() as string[] | undefined) ?? []);

	/** Whether the options are on screen (in the Filter menu or the pill's popover). */
	let shown = $state(false);
	let search = $state("");
	/** What's searched for: once typing pauses. */
	const term = new Debounced(() => search.trim(), searchDelay);

	/** On the option list: it's searched while shown, and the search starts over each time. */
	const whileShown: Attachment = () => {
		shown = true;
		return () => {
			shown = false;
			search = "";
			term.setImmediately("");
		};
	};

	/** The records seen so far, by value, to name the ticked ones. */
	const known = new SvelteMap<string, RecordOption>();
	/** Values whose names were asked for (whether or not they exist). */
	const asked = new Set<string>();

	function remember(result: RecordOptions) {
		for (const option of [...result.selected, ...result.options]) {
			if (!known.has(option.value)) known.set(option.value, option);
		}
	}

	// The names of ticked ones not seen yet (e.g. from a link), also while closed.
	$effect(() => {
		const missing = selected.filter(
			(value) => value !== noneToken && !asked.has(value) && !untrack(() => known.has(value)),
		);
		if (!missing.length) return;
		for (const value of missing) asked.add(value);
		Promise.resolve(untrack(() => load)({ search: "", selected: missing }))
			.then(remember)
			.catch(() => {});
	});

	// Searching, while shown: right away when shown or the list's other filters change (a new
	// `load`), and for each term. A failed search keeps what was found before.
	const answer = resource(
		[() => shown, () => load, () => term.current],
		async (
			[open, ask, words],
			_,
			{ data, signal },
		): Promise<{ load: LoadRecordOptions; options: RecordOptions } | undefined> => {
			if (!open) return data;
			const options = await ask({ search: words, selected });
			signal.throwIfAborted();
			remember(options);
			return { load: ask, options };
		},
	);
	/**
	 * What was found, while the list's other filters are those it was found under: another's counts
	 * (on opening the filter after they changed) aren't shown while the new ones come.
	 */
	const found = $derived(answer.current?.load === load ? answer.current.options : undefined);
	const searching = $derived(term.pending || answer.loading);

	/** The option for rows without a value, unless the search rules it out. */
	const noneOption = $derived.by((): RecordOption | undefined => {
		if (!none) return undefined;
		const words = search.trim().toLowerCase();
		if (words && !none.toLowerCase().includes(words)) return undefined;
		return { value: noneToken, label: none, count: found?.none };
	});

	/**
	 * The option for rows without a value, the ticked ones that the search didn't find, then what
	 * it found, in its order (most rows first).
	 */
	const options = $derived(
		recordOptionsInOrder({
			none: noneOption,
			selected: selected.filter((value) => value !== noneToken),
			found: found ?? { options: [], selected: [] },
			known: (value) => known.get(value),
		}),
	);

	const isSelected = (value: string) => selected.includes(value);

	/** What a ticked value is called on the button. */
	const labelOf = (value: string) =>
		(value === noneToken ? none : known.get(value)?.label) ?? value;

	function toggle(value: string) {
		const next = isSelected(value)
			? selected.filter((other) => other !== value)
			: [...selected, value];
		column?.setFilterValue(next.length ? next : undefined);
	}

	registerTableFilter({
		get columnId() {
			return columnId;
		},
		get title() {
			return title;
		},
		get chosen() {
			return selected.map(labelOf);
		},
		content,
		clear: () => column?.setFilterValue(undefined),
	});
</script>

{#snippet content()}
	<Command.Root shouldFilter={false} {@attach whileShown}>
		<Command.Input bind:value={search} placeholder={searchLabel} aria-label={searchLabel} />
		<Command.List aria-busy={searching || undefined}>
			{#if !options.length}
				<p class="py-6 text-center text-sm text-muted-foreground" role="status">
					{searching || !found
						? m.common_table_filter_searching()
						: m.common_table_filter_no_results()}
				</p>
			{:else}
				<Command.Group class={cn(searching && "opacity-60 transition-opacity")}>
					{#each options as option (option.value)}
						<Command.Item
							value={option.value}
							onSelect={() => toggle(option.value)}
							class={cn(option.count === 0 && "text-muted-foreground")}
							data-no-rows={option.count === 0 || undefined}
						>
							<div
								class={cn(
									"flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
									isSelected(option.value)
										? "border-primary bg-primary text-primary-foreground"
										: "border-input [&_svg]:invisible",
								)}
							>
								<CheckIcon class="size-3.5" />
							</div>
							<div class="flex min-w-0 flex-col">
								<span class="truncate">{option.label}</span>
								{#if option.detail}
									<span class="truncate text-xs text-muted-foreground">{option.detail}</span>
								{/if}
							</div>
							{#if option.count !== undefined}
								<Command.Shortcut class="shrink-0 font-mono">
									{formatNumber(option.count)}
								</Command.Shortcut>
							{/if}
						</Command.Item>
					{/each}
				</Command.Group>
				{#if found?.more}
					<p class="px-2 py-1.5 text-xs text-muted-foreground">
						{m.common_table_filter_more()}
					</p>
				{/if}
			{/if}
			{#if selected.length}
				<Command.Separator />
				<Command.Group>
					<Command.Item
						value="__clear"
						class="justify-center [&>svg]:hidden"
						onSelect={() => column?.setFilterValue(undefined)}
					>
						{m.common_table_filter_clear()}
					</Command.Item>
				</Command.Group>
			{/if}
		</Command.List>
	</Command.Root>
{/snippet}
