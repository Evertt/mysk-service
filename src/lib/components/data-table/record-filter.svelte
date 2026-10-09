<!--
	@component
	Multi-select filter for a column of related records (a customer, an engineer, …), with more of
	them than fit in a list: the options come from the server as you type (`load`, a remote query,
	which answers with a limited number of matches), and the ones ticked are always shown, by name.
	The column's filter values are the records' codes (or ids), as in the URL, e.g.
	`?customer=CUST-0001,CUST-0007`. A column that can be empty gives `none` a label, and the rows
	without a value are an option too (`?engineer=none`). For a column with a few fixed values, see
	`FacetedFilter`.
	It goes inside the table's `Toolbar`, which lists it in its Filter menu and shows it as a pill
	while records are chosen; this component renders nothing of its own.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import { untrack } from "svelte";
	import type { Attachment } from "svelte/attachments";
	import { SvelteMap } from "svelte/reactivity";

	import { cn } from "#lib/utils.ts";

	import { registerTableFilter } from "./filters.svelte.ts";
	import type { RecordOption, RecordOptions } from "./server-table.svelte.ts";
	import { useTableContext } from "./table.svelte.ts";
	import { noneToken } from "./url-state.ts";

	let {
		columnId,
		title,
		searchLabel,
		load,
		none,
		counts,
	}: {
		columnId: string;
		title: string;
		/** The search box's placeholder and label, e.g. "Search customers…". */
		searchLabel: string;
		/** The options for a search, and the names of the ticked ones. */
		load: (input: { search: string; selected: string[] }) => PromiseLike<RecordOptions>;
		/**
		 * For a column that can be empty: offers the rows without a value as the first option, with
		 * this label, e.g. "Unassigned". Its value is `none` in the URL (`noneToken`).
		 */
		none?: string;
		/** How many rows have each value (the rows without one under `none`), shown with the options. */
		counts?: Readonly<Record<string, number>>;
	} = $props();

	/** How long typing waits before searching. */
	const searchDelay = 250;

	const table = useTableContext();
	const column = $derived(table.getColumn(columnId));
	const selected = $derived((column?.getFilterValue() as string[] | undefined) ?? []);

	/** Whether the options are on screen (in the Filter menu or the pill's popover). */
	let shown = $state(false);
	let search = $state("");
	let found = $state<RecordOptions>();
	let searching = $state(false);

	/** On the option list: it's searched while shown, and the search starts over each time. */
	const whileShown: Attachment = () => {
		shown = true;
		return () => {
			shown = false;
			search = "";
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
		Promise.resolve(load({ search: "", selected: missing }))
			.then(remember)
			.catch(() => {});
	});

	// Searching, while shown: right away when shown, then once typing pauses.
	$effect(() => {
		if (!shown) return;
		const term = search.trim();
		const ticked = untrack(() => selected);
		let current = true;
		searching = true;
		const timer = setTimeout(
			async () => {
				try {
					const result = await load({ search: term, selected: ticked });
					if (!current) return;
					remember(result);
					found = result;
				} catch {
					// Keep what was found before.
				} finally {
					if (current) searching = false;
				}
			},
			term ? searchDelay : 0,
		);
		return () => {
			current = false;
			clearTimeout(timer);
		};
	});

	/** The option for rows without a value, unless the search rules it out. */
	const noneOption = $derived.by((): RecordOption[] => {
		if (!none) return [];
		const term = search.trim().toLowerCase();
		return term && !none.toLowerCase().includes(term) ? [] : [{ value: noneToken, label: none }];
	});

	/**
	 * The option for rows without a value, the ticked ones that the search didn't find, then what
	 * it found, in its order.
	 */
	const options = $derived.by(() => {
		const matches = found?.options ?? [];
		const ticked = selected
			.filter((value) => value !== noneToken && !matches.some((option) => option.value === value))
			.map((value) => known.get(value) ?? { value, label: value });
		return [...noneOption, ...ticked, ...matches];
	});

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
						<Command.Item value={option.value} onSelect={() => toggle(option.value)}>
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
							<span class="truncate">{option.label}</span>
							{#if option.detail}
								<span class="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
									{option.detail}
								</span>
							{/if}
							{#if counts}
								<span
									class={cn(
										"shrink-0 font-mono text-xs text-muted-foreground",
										!option.detail && "ml-auto",
									)}
								>
									{counts[option.value] ?? 0}
								</span>
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
						class="justify-center"
						onSelect={() => column?.setFilterValue(undefined)}
					>
						{m.common_table_filter_clear()}
					</Command.Item>
				</Command.Group>
			{/if}
		</Command.List>
	</Command.Root>
{/snippet}
