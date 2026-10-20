<!--
	@component
	Multi-select filter for a column with a fixed set of values (status, type, …), showing how
	many rows have each value: a list's set filter (`oneOf()`, `code`, …, which `ListToolbar` renders
	it for). Its title, options and `none` default to the column's (its label, `meta.filterOptions`,
	and for a column that can be empty, `meta.none`: the rows without a value are an option too). A
	server-side table passes the `counts`, which it can't count itself.
	It goes inside the table's `Toolbar`, which lists it in its Filter menu and shows it as a pill
	while values are chosen; this component renders nothing of its own.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";

	import { formatNumber } from "#lib/i18n/format.ts";
	import { cn } from "#lib/utils.ts";

	import type { FilterOption } from "./features.ts";
	import { filterColumn, registerTableFilter } from "./filters.svelte.ts";
	import { useTableContext } from "./table.svelte.ts";
	import { noneToken } from "./url-state.ts";

	let {
		columnId,
		title: givenTitle,
		options: givenOptions,
		counts: given,
		none: givenNone,
	}: {
		columnId: string;
		/** The column's label if not given. */
		title?: string;
		/** The column's (`meta.filterOptions`, e.g. an enum's) if not given. */
		options?: readonly FilterOption[];
		/**
		 * How many rows have each value (the rows without one under `none`); counted from the
		 * table's rows if not given.
		 */
		counts?: Readonly<Record<string, number>> | ReadonlyMap<string, number>;
		/**
		 * For a column that can be empty: offers the rows without a value as the first option, with
		 * this label, e.g. "Unassigned" (`true` for the column's, `noneLabel()`). Its value is `none` in the
		 * URL (`noneToken`), which `filterFn: "oneOf"` keeps rows without a value by. The column's
		 * (`columnNone()`) if not given; `false` offers none.
		 */
		none?: string | boolean;
	} = $props();

	const table = useTableContext();
	const filter = filterColumn(table, () => ({ columnId, title: givenTitle, none: givenNone }));
	const column = $derived(filter.column);
	const title = $derived(filter.title);
	const none = $derived(filter.none);
	const options = $derived(givenOptions ?? column?.columnDef.meta?.filterOptions ?? []);
	const counts = $derived.by((): ReadonlyMap<unknown, number> => {
		if (given instanceof Map) return given;
		if (given) return new Map(Object.entries(given));
		// The rows without a value count for the `none` option.
		const found = new Map<unknown, number>();
		for (const [value, count] of column?.getFacetedUniqueValues() ?? []) {
			const key = value ?? noneToken;
			found.set(key, (found.get(key) ?? 0) + count);
		}
		return found;
	});
	/** The options, the one for rows without a value first. */
	const shown = $derived(none ? [{ value: noneToken, label: none }, ...options] : options);
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
				...shown.filter((option) => selected.has(option.value)).map((option) => option.label),
				...[...selected].filter((value) => !shown.some((option) => option.value === value)),
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
				{#each shown as option (option.value)}
					<Command.Item
						value={option.value}
						keywords={option.keywords ?? [option.label]}
						onSelect={() => toggle(option.value)}
						class={cn(option.count === 0 && "text-muted-foreground")}
						data-no-rows={option.count === 0 || undefined}
					>
						<div
							class={cn(
								"flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
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
						<Command.Shortcut class="shrink-0 font-mono">
							{formatNumber(option.count ?? counts.get(option.value) ?? 0)}
						</Command.Shortcut>
					</Command.Item>
				{/each}
			</Command.Group>
			{#if selected.size}
				<Command.Separator />
				<Command.Group>
					<Command.Item
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
