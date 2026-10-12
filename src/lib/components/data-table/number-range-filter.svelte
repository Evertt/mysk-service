<!--
	@component
	A filter on a number column by a range: a minimum, a maximum or both, each included
	(`?quantity=..10`: at most 10; `5..`: at least 5; `5..10`). See `ranges.ts` for the grammar.
	The column needs `filterFn: "inNumberRange"` (a server-side list, `numberRange` in its
	definition). It goes inside the table's `Toolbar`, which lists it in its Filter menu and shows it
	as a pill while it's on; this component renders nothing of its own.
-->
<script lang="ts">
	import { formatNumber } from "#lib/i18n/format.ts";

	import { registerTableFilter } from "./filters.svelte.ts";
	import { isRangeNumber, type NumberRange, numberRangeToken, parseNumberRange } from "./ranges.ts";
	import { useTableContext } from "./table.svelte.ts";

	let {
		columnId,
		title,
		step = "any",
		min,
	}: {
		columnId: string;
		title: string;
		/** The inputs' step, e.g. 1 for counts; any number if not given. */
		step?: number | "any";
		/** The smallest value the inputs offer, e.g. 0 for counts. */
		min?: number;
	} = $props();

	const id = $props.id();
	const table = useTableContext();
	const column = $derived(table.getColumn(columnId));
	/** The filter's value, its token in the URL. */
	const token = $derived((column?.getFilterValue() as string[] | undefined)?.[0]);
	const range = $derived(token === undefined ? undefined : parseNumberRange(token));

	// The inputs: the filter's, until changed. (An empty number input binds `null`.)
	let from = $derived<number | null | undefined>(range?.from ?? null);
	let to = $derived<number | null | undefined>(range?.to ?? null);

	/** A range in words, e.g. `At most 10` or `5–10`. */
	function describe({ from, to }: NumberRange) {
		if (from !== null && to !== null) {
			return from === to
				? formatNumber(from)
				: m.common_table_range_between({ from: formatNumber(from), to: formatNumber(to) });
		}
		if (from !== null) return m.common_table_range_at_least({ value: formatNumber(from) });
		return m.common_table_range_at_most({ value: formatNumber(to ?? 0) });
	}

	function choose(next: string | undefined) {
		column?.setFilterValue(next === undefined ? undefined : [next]);
	}

	/** An input's number, if it has one the filter takes. */
	const valueOf = (value: number | null | undefined) => (isRangeNumber(value) ? value : null);

	function apply(event: SubmitEvent) {
		event.preventDefault();
		const ends = [valueOf(from), valueOf(to)];
		// Ends in the wrong order are taken the right way round.
		if (ends[0] !== null && ends[1] !== null && ends[0] > ends[1]) ends.reverse();
		const [start, end] = ends;
		choose(start === null && end === null ? undefined : numberRangeToken({ from: start, to: end }));
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
			return [range ? describe(range) : token];
		},
		content,
		clear: () => choose(undefined),
	});
</script>

{#snippet content()}
	<form class="flex flex-col gap-3 p-3" onsubmit={apply}>
		<div class="grid grid-cols-2 gap-2">
			<Field.Field class="gap-1.5">
				<Field.Label for="{id}-from">{m.common_table_range_min()}</Field.Label>
				<Input id="{id}-from" type="number" inputmode="decimal" {step} {min} bind:value={from} />
			</Field.Field>
			<Field.Field class="gap-1.5">
				<Field.Label for="{id}-to">{m.common_table_range_max()}</Field.Label>
				<Input id="{id}-to" type="number" inputmode="decimal" {step} {min} bind:value={to} />
			</Field.Field>
		</div>
		<div class="flex justify-end gap-2">
			{#if token !== undefined}
				<Button type="button" variant="ghost" size="sm" onclick={() => choose(undefined)}>
					{m.common_table_filter_clear()}
				</Button>
			{/if}
			<Button type="submit" size="sm" disabled={valueOf(from) === null && valueOf(to) === null}>
				{m.common_table_range_apply()}
			</Button>
		</div>
	</form>
{/snippet}
