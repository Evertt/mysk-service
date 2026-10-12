<!--
	@component
	A filter on a number or an amount of money by ranges: each a minimum, a maximum or both, both
	included (`?quantity=..10`: at most 10; `5..`: at least 5; `5..10`; money in euros,
	`?total=500..`). Several are kept as one filter (the rows in any of them, `?quantity=2,5..8,12`),
	and a column that can be empty offers its rows without a value too (`none`). See `ranges.ts`.
	The column needs `filterFn: "inNumberRange"` or, for money (cents), `"inMoneyRange"` (a
	server-side list, `numberRange` or `moneyRange` in its definition). It goes inside the table's
	`Toolbar`, which lists it in its Filter menu and shows it as a pill while it's on; this component
	renders nothing of its own.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";

	import { formatCents, formatNumber } from "#lib/i18n/format.ts";
	import { cn } from "#lib/utils.ts";

	import { registerTableFilter } from "./filters.svelte.ts";
	import RangeValues from "./range-values.svelte";
	import {
		euroCents,
		isRangeNumber,
		moneyRangeToken,
		type NumberRange,
		numberRangeToken,
		parseMoneyRange,
		parseNumberRange,
	} from "./ranges.ts";
	import { useTableContext } from "./table.svelte.ts";
	import { noneToken } from "./url-state.ts";

	let {
		columnId,
		title,
		money = false,
		step = money ? 0.01 : "any",
		min,
		none,
	}: {
		columnId: string;
		title: string;
		/** An amount of money: cents in the table, euros in the inputs and the URL. */
		money?: boolean;
		/** The inputs' step, e.g. 1 for counts; cents for money, else any number. */
		step?: number | "any";
		/** The smallest value the inputs offer, e.g. 0 for counts. */
		min?: number;
		/** For a column that can be empty: offers the rows without a value, with this label. */
		none?: string;
	} = $props();

	const id = $props.id();
	const table = useTableContext();
	const column = $derived(table.getColumn(columnId));
	/** The filter's values, their tokens in the URL. */
	const tokens = $derived((column?.getFilterValue() as string[] | undefined) ?? []);

	const parse = (token: string) => (money ? parseMoneyRange(token) : parseNumberRange(token));
	const format = (value: number) => (money ? formatCents(value) : formatNumber(value));

	/** A range in words, e.g. `At most 10` or `5–10`. */
	function describe({ from, to }: NumberRange) {
		if (from !== null && to !== null) {
			return from === to
				? format(from)
				: m.common_table_range_between({ from: format(from), to: format(to) });
		}
		if (from !== null) return m.common_table_range_at_least({ value: format(from) });
		return m.common_table_range_at_most({ value: format(to ?? 0) });
	}

	function labelOf(token: string) {
		if (token === noneToken) return none ?? m.common_table_filter_none();
		const range = parse(token);
		return range ? describe(range) : token;
	}

	function set(next: readonly string[]) {
		column?.setFilterValue(next.length ? [...next] : undefined);
	}
	const toggle = (token: string) =>
		set(tokens.includes(token) ? tokens.filter((t) => t !== token) : [...tokens, token]);

	// The inputs (an empty number input binds `null`).
	let from = $state<number | null | undefined>(null);
	let to = $state<number | null | undefined>(null);

	/** An input's value as it's held: cents for money, from the digits it shows. */
	function valueOf(value: number | null | undefined) {
		if (!isRangeNumber(value)) return null;
		return money ? (euroCents(value.toFixed(2)) ?? null) : value;
	}

	/** The range being made, as the URL's token, if it is one; ends the wrong way round swapped. */
	const custom = $derived.by(() => {
		const ends = [valueOf(from), valueOf(to)];
		if (ends[0] === null && ends[1] === null) return undefined;
		if (ends[0] !== null && ends[1] !== null && ends[0] > ends[1]) ends.reverse();
		const range = { from: ends[0], to: ends[1] };
		const token = money ? moneyRangeToken(range) : numberRangeToken(range);
		return parse(token) ? token : undefined;
	});

	function add(event: SubmitEvent) {
		event.preventDefault();
		if (!custom) return;
		if (!tokens.includes(custom)) set([...tokens, custom]);
		from = to = null;
	}

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
	{#if none}
		<Command.Root class="border-b">
			<Command.List>
				<Command.Group>
					<Command.Item value={noneToken} onSelect={() => toggle(noneToken)}>
						<CheckIcon class={cn("size-4", !tokens.includes(noneToken) && "invisible")} />
						<span class="truncate">{none}</span>
					</Command.Item>
				</Command.Group>
			</Command.List>
		</Command.Root>
	{/if}
	<form class="flex flex-col gap-3 p-3" onsubmit={add}>
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
			{#if tokens.length}
				<Button type="button" variant="ghost" size="sm" onclick={() => set([])}>
					{m.common_table_filter_clear()}
				</Button>
			{/if}
			<Button type="submit" size="sm" disabled={!custom}>
				{m.common_table_range_add()}
			</Button>
		</div>
	</form>
{/snippet}
