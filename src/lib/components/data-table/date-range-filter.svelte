<!--
	@component
	A filter on a date column by ranges of days: presets relative to today ("This week", "Before
	today", …), which stay relative in the URL (`?scheduled=this-week`), and ranges of one's own,
	each end a day or a preset (`?scheduled=2026-10-01..2026-10-07`, `today..`), either end open.
	Several are kept as one filter (the rows in any of them), and a column that can be empty offers
	its rows without a date too (`none`): `?scheduled=none,this-week`. See `ranges.ts`.
	The column needs `filterFn: "inDateRange"` (a server-side list, `dateRange` in its definition).
	It goes inside the table's `Toolbar`, which lists it in its Filter menu and shows it as a pill
	while it's on; this component renders nothing of its own (see `RangeFilter`).
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
	import { isDay } from "#lib/dates.ts";
	import { dateFormatter, formatDate } from "#lib/i18n/format.ts";

	import RangeFilter from "./range-filter.svelte";
	import {
		type DateRange,
		dateRangeToken,
		datePresets,
		isDatePreset,
		parseDateRange,
		presetCanBe,
		presetRange,
	} from "./ranges.ts";
	import { noneToken } from "./url-state.ts";

	let {
		columnId,
		title,
		presets = ["today", "this-week", "next-week", "this-month", "last-30-days", "before-today"],
		none,
	}: {
		columnId: string;
		title: string;
		/** The presets offered, in their order (the URL takes any of `datePresets`). */
		presets?: readonly DatePreset[];
		/**
		 * For a column that can be empty (`meta.filterNone`): offers the rows without a date first,
		 * with this label, e.g. "Unscheduled". Its value is `none` in the URL.
		 */
		none?: string;
	} = $props();

	const id = $props.id();

	const shortDay = dateFormatter({ day: "numeric", month: "short" });

	/** An end of a range in words: a day, or a preset's name. */
	const endLabel = (end: string, format: typeof formatDate) =>
		isDatePreset(end) ? presetLabels[end]() : format(Temporal.PlainDate.from(end));

	/** A range in words, e.g. `1–7 Oct 2026`, `From today` or `Until 7 Oct 2026`. */
	function describe({ from, to }: DateRange, format: typeof formatDate = formatDate) {
		if (from !== null && to !== null) {
			if (from === to) return endLabel(from, format);
			if (isDay(from) && isDay(to))
				return format.range(Temporal.PlainDate.from(from), Temporal.PlainDate.from(to));
			return m.common_table_range_between({
				from: endLabel(from, format),
				to: endLabel(to, format),
			});
		}
		if (from !== null) return m.common_table_range_from({ date: endLabel(from, format) });
		return m.common_table_range_until({ date: endLabel(to ?? "", format) });
	}

	/** What a value is called: a preset's name, `none`'s label, or its ends in words. */
	function labelOf(token: string) {
		if (token === noneToken) return none ?? m.common_table_filter_none();
		if (isDatePreset(token)) return presetLabels[token]();
		const [from = "", to = from] = token.split("..");
		return parseDateRange(token) ? describe({ from: from || null, to: to || null }) : token;
	}

	// A range of one's own: each end a day, or a preset (`""` for a day).
	let fromPreset = $state("");
	let toPreset = $state("");
	let fromDay = $state("");
	let toDay = $state("");
	/** The range being made, as the URL's token, if it is one. */
	const custom = $derived.by(() => {
		const from = fromPreset || fromDay || null;
		const to = toPreset || toDay || null;
		if (from === null && to === null) return undefined;
		const token = dateRangeToken({ from, to });
		return parseDateRange(token) ? token : undefined;
	});
</script>

{#snippet end(
	label: string,
	which: keyof DateRange,
	preset: string,
	setPreset: (value: string) => void,
	day: string,
	setDay: (value: string) => void,
)}
	<Field.Field class="gap-1.5">
		<Field.Label for="{id}-{which}">{label}</Field.Label>
		<NativeSelect.Root
			id="{id}-{which}"
			value={preset}
			onchange={(event) => setPreset(event.currentTarget.value)}
			class="w-full"
		>
			<NativeSelect.Option value="">{m.common_table_range_pick_date()}</NativeSelect.Option>
			{#each datePresets.filter((option) => presetCanBe(option, which)) as option (option)}
				<NativeSelect.Option value={option}>{presetLabels[option]()}</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>
		{#if !preset}
			<Input
				type="date"
				aria-label={m.common_table_range_end_day({ end: label })}
				value={day}
				oninput={(event) => setDay(event.currentTarget.value)}
			/>
		{/if}
	</Field.Field>
{/snippet}

{#snippet ends()}
	{@render end(
		m.common_table_range_start(),
		"from",
		fromPreset,
		(value) => (fromPreset = value),
		fromDay,
		(value) => (fromDay = value),
	)}
	{@render end(
		m.common_table_range_end(),
		"to",
		toPreset,
		(value) => (toPreset = value),
		toDay,
		(value) => (toDay = value),
	)}
{/snippet}

<RangeFilter
	{columnId}
	{title}
	{labelOf}
	{none}
	presets={presets.map((preset) => ({
		token: preset,
		label: presetLabels[preset](),
		hint: describe(presetRange(preset), shortDay),
	}))}
	heading={m.common_table_range_custom()}
	{ends}
	{custom}
	onadded={() => (fromPreset = toPreset = fromDay = toDay = "")}
/>
