<!--
	@component
	A filter on a date column by a range of days: presets relative to today ("This week", "Before
	today", …), which stay relative in the URL (`?scheduled=this-week`), or days of one's own from
	and to (`?scheduled=2026-10-01..2026-10-07`, either end open). See `ranges.ts` for the grammar.
	The column needs `filterFn: "inDateRange"` (a server-side list, `dateRange` in its definition).
	It goes inside the table's `Toolbar`, which lists it in its Filter menu and shows it as a pill
	while it's on; this component renders nothing of its own.
-->
<script module lang="ts">
	import type { DatePreset } from "./ranges.ts";

	/** What each preset is called. */
	const presetLabels: Record<DatePreset, () => string> = {
		today: m.common_table_preset_today,
		yesterday: m.common_table_preset_yesterday,
		tomorrow: m.common_table_preset_tomorrow,
		"this-week": m.common_table_preset_this_week,
		"last-week": m.common_table_preset_last_week,
		"next-week": m.common_table_preset_next_week,
		"this-month": m.common_table_preset_this_month,
		"last-month": m.common_table_preset_last_month,
		"next-month": m.common_table_preset_next_month,
		"this-year": m.common_table_preset_this_year,
		"last-year": m.common_table_preset_last_year,
		"last-7-days": m.common_table_preset_last_7_days,
		"next-7-days": m.common_table_preset_next_7_days,
		"last-30-days": m.common_table_preset_last_30_days,
		"next-30-days": m.common_table_preset_next_30_days,
		"before-today": m.common_table_preset_before_today,
		"from-today": m.common_table_preset_from_today,
	};
</script>

<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";

	import { dateFormatter, formatDate } from "#lib/i18n/format.ts";
	import { cn } from "#lib/utils.ts";

	import { registerTableFilter } from "./filters.svelte.ts";
	import {
		type DateRange,
		dateRangeToken,
		dayStart,
		isDatePreset,
		parseDateRange,
		presetRange,
	} from "./ranges.ts";
	import { useTableContext } from "./table.svelte.ts";

	let {
		columnId,
		title,
		presets = ["today", "this-week", "next-week", "this-month", "last-30-days", "before-today"],
	}: {
		columnId: string;
		title: string;
		/** The presets offered, in their order (the URL takes any of `datePresets`). */
		presets?: readonly DatePreset[];
	} = $props();

	const id = $props.id();
	const table = useTableContext();
	const column = $derived(table.getColumn(columnId));
	/** The filter's value, its token in the URL. */
	const token = $derived((column?.getFilterValue() as string[] | undefined)?.[0]);
	const range = $derived(token === undefined ? undefined : parseDateRange(token));
	const preset = $derived(token !== undefined && isDatePreset(token) ? token : undefined);

	// The days of one's own: the filter's, until changed.
	let from = $derived(range?.from ?? "");
	let to = $derived(range?.to ?? "");

	const shortDay = dateFormatter({ day: "numeric", month: "short" });

	/** A range in words, e.g. `1–7 Oct 2026` or `From 1 Oct 2026`. */
	function describe({ from, to }: DateRange, format: typeof formatDate = formatDate) {
		if (from !== null && to !== null) {
			return from === to ? format(dayStart(from)) : format.range(dayStart(from), dayStart(to));
		}
		if (from !== null) return m.common_table_range_from({ date: format(dayStart(from)) });
		return m.common_table_range_until({ date: format(dayStart(to ?? "")) });
	}

	function choose(next: string | undefined) {
		column?.setFilterValue(next === undefined ? undefined : [next]);
	}

	function applyCustom(event: SubmitEvent) {
		event.preventDefault();
		const ends = [from || null, to || null];
		// Ends in the wrong order are taken the right way round.
		if (ends[0] && ends[1] && ends[0] > ends[1]) ends.reverse();
		const [start, end] = ends;
		choose(start || end ? dateRangeToken({ from: start, to: end }) : undefined);
	}

	registerTableFilter({
		get columnId() {
			return columnId;
		},
		get title() {
			return title;
		},
		get chosen() {
			if (token === undefined) return [];
			return [preset ? presetLabels[preset]() : range ? describe(range) : token];
		},
		content,
		clear: () => choose(undefined),
	});
</script>

{#snippet content()}
	<Command.Root data-filter-autofocus>
		<Command.List>
			<Command.Group>
				{#each presets as option (option)}
					<Command.Item value={option} onSelect={() => choose(option)}>
						<CheckIcon class={cn("size-4", preset !== option && "invisible")} />
						<span class="truncate">{presetLabels[option]()}</span>
						<Command.Shortcut class="shrink-0">
							{describe(presetRange(option), shortDay)}
						</Command.Shortcut>
					</Command.Item>
				{/each}
			</Command.Group>
		</Command.List>
	</Command.Root>
	<Separator />
	<form class="flex flex-col gap-3 p-3" onsubmit={applyCustom}>
		<span class="text-xs font-medium text-muted-foreground">{m.common_table_range_custom()}</span>
		<div class="grid grid-cols-2 gap-2">
			<Field.Field class="gap-1.5">
				<Field.Label for="{id}-from">{m.common_table_range_start()}</Field.Label>
				<Input id="{id}-from" type="date" bind:value={from} max={to || undefined} />
			</Field.Field>
			<Field.Field class="gap-1.5">
				<Field.Label for="{id}-to">{m.common_table_range_end()}</Field.Label>
				<Input id="{id}-to" type="date" bind:value={to} min={from || undefined} />
			</Field.Field>
		</div>
		<div class="flex justify-end gap-2">
			{#if token !== undefined}
				<Button type="button" variant="ghost" size="sm" onclick={() => choose(undefined)}>
					{m.common_table_filter_clear()}
				</Button>
			{/if}
			<Button type="submit" size="sm" disabled={!from && !to}>
				{m.common_table_range_apply()}
			</Button>
		</div>
	</form>
{/snippet}
