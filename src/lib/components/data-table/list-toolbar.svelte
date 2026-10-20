<!--
	@component
	A list's toolbar (`Toolbar`), its filters from the list's definition: one for each column that
	filters, in the definition's order, of its filter's kind. A set filter (`oneOf()`, `code`, `id`)
	is a `FacetedFilter`, with the column's options (`meta.filterOptions`, e.g. an enum's) unless
	`filters` gives its own, or a `RecordFilter` when `filters` gives it a `load` (the list's options
	query for it, on a server-side list); a `dateRange` a `DateRangeFilter`; a `numberRange` or
	`moneyRange` a `NumberRangeFilter`. Each is titled with its column's label, and offers the rows
	without a value with its column's `meta.none` if its filter takes `none`. A server-side list
	passes its `facets`, the counts by column id; a client-side one counts its rows itself.

	```svelte
	<ListToolbar
		list={ordersList}
		{facets}
		searchLabel={m.orders_search()}
		filters={{
			customer: { load: getOrderCustomerOptions, searchLabel: m.common_table_search_customers() },
			scheduledFor: { presets: ["today", "this-week"] },
		}}
	/>
	```

	`filters` is typed by the list: a filter on codes or ids (whose values the definition doesn't
	know) needs its `options` or `load`; `false` leaves a column's filter out of the toolbar (e.g.
	one the page sets in its own way). `children` go after the filters, `actions` with the toolbar's.
-->
<script module lang="ts">
	import type { Snippet } from "svelte";

	import type { FilterOption } from "./features.ts";
	import type { FilterId, FilterValue, ListColumns, ListWhere } from "./list-definition.ts";
	import type { DatePreset, DateRange, NumberRange } from "./ranges.ts";
	import type { RecordOptions } from "./server-table.svelte.ts";

	/** What every filter in the toolbar may be given instead of its column's. */
	interface FilterBase {
		/** Its title, if not the column's label. */
		title?: string;
		/** Its option for the rows without a value, if not the column's (`columnNone()`); `false`: none. */
		none?: string | boolean;
	}

	/** A set filter's: its options, if not the column's. */
	interface SetFilter extends FilterBase {
		options?: readonly FilterOption[];
	}

	/** A filter on related records, searched on the server as you type (`RecordFilter`). */
	interface RecordFilterConfig<C> extends FilterBase {
		/** The list's options query for the column (`facetOptions()` on the server). */
		load: (input: {
			where: ListWhere<C>;
			search: string;
			selected: string[];
		}) => PromiseLike<RecordOptions>;
		/** The search box's placeholder, e.g. "Search customers…". */
		searchLabel: string;
	}

	interface DateFilter extends FilterBase {
		/** The presets offered, in their order. */
		presets?: readonly DatePreset[];
	}

	interface NumberFilter extends FilterBase {
		/** The inputs' step, e.g. 1 for counts. */
		step?: number | "any";
		/** The smallest value the inputs offer, e.g. 0 for counts. */
		min?: number;
	}

	/** Whether a filter's values are open (codes, ids), so its options must come from elsewhere. */
	type Open<T> = [T] extends [object]
		? false
		: string extends T
			? true
			: number extends T
				? true
				: false;

	/** What a column's filter may be given, by its values' type. */
	type FilterConfig<C, T> = [NonNullable<T>] extends [DateRange]
		? DateFilter
		: [NonNullable<T>] extends [NumberRange]
			? NumberFilter
			: Open<NonNullable<T>> extends true
				? (SetFilter & { options: readonly FilterOption[] }) | RecordFilterConfig<C>
				: SetFilter;

	type OpenId<C> = {
		[K in FilterId<C>]: Open<NonNullable<FilterValue<C, K>>> extends true ? K : never;
	}[FilterId<C>];

	/**
	 * The toolbar's filters' own settings, by column id: required for those on codes or ids, which
	 * need their options or a `load`; `false` leaves one out.
	 */
	export type ListFilters<C> = {
		readonly [K in OpenId<C>]: FilterConfig<C, FilterValue<C, K>> | false;
	} & {
		readonly [K in Exclude<FilterId<C>, OpenId<C>>]?: FilterConfig<C, FilterValue<C, K>> | false;
	};

	interface BaseProps<C extends ListColumns> {
		list: { columns: C; filterKinds: Readonly<Record<string, { range?: string }>> };
		/** How many rows have each value, by column id: a server-side list's facets. */
		facets?: Readonly<Record<string, Readonly<Record<string, number>> | undefined>>;
		searchLabel?: string;
		/** With the toolbar's own actions, e.g. a select of the page's. */
		actions?: Snippet;
		/** After the filters. */
		children?: Snippet;
	}

	export type ListToolbarProps<C extends ListColumns> = BaseProps<C> &
		(Record<never, never> extends ListFilters<C>
			? { filters?: NoInfer<ListFilters<C>> }
			: { filters: NoInfer<ListFilters<C>> });
</script>

<script lang="ts" generics="C extends ListColumns">
	import { untrack } from "svelte";

	import DateRangeFilter from "./date-range-filter.svelte";
	import FacetedFilter from "./faceted-filter.svelte";
	import NumberRangeFilter from "./number-range-filter.svelte";
	import RecordFilter from "./record-filter.svelte";
	import { listWhere, recordOptions } from "./server-table.svelte.ts";
	import { useTableContext } from "./table.svelte.ts";

	let { list, facets, filters, searchLabel, actions, children }: ListToolbarProps<C> = $props();

	const table = useTableContext();

	/** A filter's settings, untyped. */
	type Settings = Partial<SetFilter & DateFilter & NumberFilter & RecordFilterConfig<C>>;
	const settingsOf = (id: string): Settings =>
		(filters as Readonly<Record<string, Settings | false | undefined>> | undefined)?.[id] || {};

	// Which filters there are, and the record filters' queries: they don't change while the table
	// is open (their options and the rest may).
	const shown = untrack(() => {
		const columns = new Set(table.getAllLeafColumns().map((column) => column.id));
		return Object.entries(list.filterKinds).flatMap(([id, kind]) =>
			columns.has(id) && (filters as Record<string, unknown> | undefined)?.[id] !== false
				? [{ id, range: kind.range }]
				: [],
		);
	});
	const loads = untrack(() =>
		Object.fromEntries(
			shown.flatMap(({ id }) => {
				const { load } = settingsOf(id);
				return load ? [[id, recordOptions(load, listWhere<C>(), id as FilterId<C>)]] : [];
			}),
		),
	);
</script>

<table.Toolbar {searchLabel} {actions}>
	{#each shown as { id, range } (id)}
		{@const settings = settingsOf(id)}
		{#if range === "dateRange"}
			<DateRangeFilter
				columnId={id}
				title={settings.title}
				presets={settings.presets}
				none={settings.none}
			/>
		{:else if range}
			<NumberRangeFilter
				columnId={id}
				title={settings.title}
				step={settings.step}
				min={settings.min}
				none={settings.none}
			/>
		{:else if loads[id] && settings.searchLabel}
			<RecordFilter
				columnId={id}
				title={settings.title}
				searchLabel={settings.searchLabel}
				load={loads[id].current}
				none={settings.none}
			/>
		{:else}
			<FacetedFilter
				columnId={id}
				title={settings.title}
				options={settings.options}
				counts={facets?.[id]}
				none={settings.none}
			/>
		{/if}
	{/each}
	{@render children?.()}
</table.Toolbar>
