<!--
	@component
	Multi-select filter for a column of related records (a customer, an engineer, …), with more of
	them than fit in a list: the options come from the server as you type (`load`, a remote query,
	which answers with a limited number of matches), and the ones ticked are always shown, by name.
	The column's filter values are the records' codes (or ids), as in the URL, e.g.
	`?customer=CUST-0001,CUST-0007`. For a column with a few fixed values, see `FacetedFilter`.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import CirclePlusIcon from "@lucide/svelte/icons/circle-plus";
	import { untrack } from "svelte";
	import { SvelteMap } from "svelte/reactivity";

	import { cn } from "#lib/utils.ts";

	import type { RecordOption, RecordOptions } from "./server-table.svelte.ts";
	import { useTableContext } from "./table.svelte.ts";

	let {
		columnId,
		title,
		searchLabel,
		load,
	}: {
		columnId: string;
		title: string;
		/** The search box's placeholder and label, e.g. "Search customers…". */
		searchLabel: string;
		/** The options for a search, and the names of the ticked ones. */
		load: (input: { search: string; selected: string[] }) => PromiseLike<RecordOptions>;
	} = $props();

	/** How long typing waits before searching. */
	const searchDelay = 250;

	const table = useTableContext();
	const column = $derived(table.getColumn(columnId));
	const selected = $derived((column?.getFilterValue() as string[] | undefined) ?? []);

	let open = $state(false);
	let search = $state("");
	let found = $state<RecordOptions>();
	let searching = $state(false);

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
			(value) => !asked.has(value) && !untrack(() => known.has(value)),
		);
		if (!missing.length) return;
		for (const value of missing) asked.add(value);
		Promise.resolve(load({ search: "", selected: missing }))
			.then(remember)
			.catch(() => {});
	});

	// Searching, while open: right away when opened, then once typing pauses.
	$effect(() => {
		if (!open) return;
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

	/** The ticked ones that the search didn't find first, then what it found, in its order. */
	const shown = $derived.by(() => {
		const options = found?.options ?? [];
		const ticked = selected
			.filter((value) => !options.some((option) => option.value === value))
			.map((value) => known.get(value) ?? { value, label: value });
		return [...ticked, ...options];
	});

	const isSelected = (value: string) => selected.includes(value);

	function toggle(value: string) {
		const next = isSelected(value)
			? selected.filter((other) => other !== value)
			: [...selected, value];
		column?.setFilterValue(next.length ? next : undefined);
	}
</script>

<Popover.Root
	bind:open
	onOpenChange={(isOpen) => {
		if (!isOpen) search = "";
	}}
>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm" class="border-dashed">
				<CirclePlusIcon data-icon="inline-start" />
				{title}
				{#if selected.length}
					<Separator orientation="vertical" class="mx-0.5 h-4" />
					{#if selected.length > 2}
						<Badge variant="secondary">
							{m.common_table_filter_selected({ count: selected.length })}
						</Badge>
					{:else}
						{#each selected as value (value)}
							<Badge variant="secondary">{known.get(value)?.label ?? value}</Badge>
						{/each}
					{/if}
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-72 p-0" align="start">
		<Command.Root shouldFilter={false}>
			<Command.Input bind:value={search} placeholder={searchLabel} aria-label={searchLabel} />
			<Command.List aria-busy={searching || undefined}>
				{#if !shown.length}
					<p class="py-6 text-center text-sm text-muted-foreground" role="status">
						{searching || !found
							? m.common_table_filter_searching()
							: m.common_table_filter_no_results()}
					</p>
				{:else}
					<Command.Group class={cn(searching && "opacity-60 transition-opacity")}>
						{#each shown as option (option.value)}
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
	</Popover.Content>
</Popover.Root>
