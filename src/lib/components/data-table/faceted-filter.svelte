<!--
	@component
	Multi-select filter for a column with a fixed set of values (status, type, …), showing how
	many rows have each value. The column needs `filterFn: "oneOf"` (or a filter function and
	`meta.filter` of its own). A server-side table passes the `counts`, which it can't count itself.
	It goes inside the table's `Toolbar`, which lists it in its Filter menu and shows it as a pill
	while values are chosen; this component renders nothing of its own.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import type { Component } from "svelte";

	import { cn } from "#lib/utils.ts";

	import { registerTableFilter } from "./filters.svelte.ts";
	import { useTableContext } from "./table.svelte.ts";

	interface Option {
		value: string;
		label: string;
		icon?: Component;
		/** Shown after the label, e.g. a customer's code; the search box finds it by it too. */
		detail?: string;
	}

	let {
		columnId,
		title,
		options,
		counts: given,
	}: {
		columnId: string;
		title: string;
		options: Option[];
		/** How many rows have each value; counted from the table's rows if not given. */
		counts?: Readonly<Record<string, number>> | ReadonlyMap<string, number>;
	} = $props();

	const table = useTableContext();
	const column = $derived(table.getColumn(columnId));
	const counts = $derived.by((): ReadonlyMap<unknown, number> => {
		if (given instanceof Map) return given;
		if (given) return new Map(Object.entries(given));
		return column?.getFacetedUniqueValues() ?? new Map();
	});
	const selected = $derived(new Set((column?.getFilterValue() as string[] | undefined) ?? []));

	function toggle(value: string) {
		const next = new Set(selected);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		column?.setFilterValue(next.size ? [...next] : undefined);
	}

	registerTableFilter({
		get columnId() {
			return columnId;
		},
		get title() {
			return title;
		},
		get chosen() {
			// Options first, in their order; then a value from the URL that isn't one, as it is.
			return [
				...options.filter((option) => selected.has(option.value)).map((option) => option.label),
				...[...selected].filter((value) => !options.some((option) => option.value === value)),
			];
		},
		content,
		clear: () => column?.setFilterValue(undefined),
	});
</script>

{#snippet content()}
	<Command.Root>
		<Command.Input placeholder={title} />
		<Command.List>
			<Command.Empty>{m.common_table_filter_no_results()}</Command.Empty>
			<Command.Group>
				{#each options as option (option.value)}
					<Command.Item
						value={option.value}
						keywords={option.detail ? [option.label, option.detail] : [option.label]}
						onSelect={() => toggle(option.value)}
					>
						<div
							class={cn(
								"flex size-4 items-center justify-center rounded-[4px] border",
								selected.has(option.value)
									? "border-primary bg-primary text-primary-foreground"
									: "border-input [&_svg]:invisible",
							)}
						>
							<CheckIcon class="size-3.5" />
						</div>
						{#if option.icon}
							<option.icon class="text-muted-foreground" />
						{/if}
						<span class="truncate">{option.label}</span>
						{#if option.detail}
							<span class="shrink-0 font-mono text-xs text-muted-foreground">{option.detail}</span>
						{/if}
						<span class="ml-auto font-mono text-xs text-muted-foreground">
							{counts.get(option.value) ?? 0}
						</span>
					</Command.Item>
				{/each}
			</Command.Group>
			{#if selected.size}
				<Command.Separator />
				<Command.Group>
					<Command.Item class="justify-center" onSelect={() => column?.setFilterValue(undefined)}>
						{m.common_table_filter_clear()}
					</Command.Item>
				</Command.Group>
			{/if}
		</Command.List>
	</Command.Root>
{/snippet}
