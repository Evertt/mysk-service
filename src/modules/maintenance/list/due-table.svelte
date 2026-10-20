<script lang="ts">
	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { createServerTable } from "#lib/components/data-table/server-table.svelte.ts";

	import { maintenanceLabels } from "../labels.ts";
	import { dueRanges } from "../model.ts";
	import { createOrdersAction } from "./bulk-actions.ts";
	import { columns } from "./columns.ts";
	import { getDueCustomerOptions, type getDueFacets, getDuePlans } from "./due-list.remote.ts";
	import { dueList } from "./due-list.ts";

	// The table is created here rather than in the page because making the table sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		plans,
		facets,
	}: {
		/** The first page of due plans, as the URL says, and how many match in all. */
		plans: Awaited<ReturnType<typeof getDuePlans>>;
		/** How many plans have each order type. */
		facets: Awaited<ReturnType<typeof getDueFacets>>;
	} = $props();

	// The next due first, overdue plus the next 30 days: the defaults the server has too.
	const table = createServerTable({
		list: dueList,
		first: () => plans,
		fetch: getDuePlans,
		columns,
		// Only there to filter by.
		initialState: { columnVisibility: { type: false, due: false } },
	});

	/** "Every plan": no range at all. */
	const ALL = "all";
	const range = $derived(
		(table.table.getColumn("due")?.getFilterValue() as string[] | undefined)?.[0] ?? ALL,
	);
	const rangeOptions = $derived([
		...maintenanceLabels.labelOptions("dueRange", dueRanges),
		{ value: ALL, label: m.maintenance_range_all() },
	]);
</script>

<!-- The range of due dates is a select of its own. -->
{#snippet tools()}
	<NativeSelect.Root
		size="sm"
		aria-label={m.maintenance_range()}
		value={range}
		onchange={(event) => {
			const value = event.currentTarget.value;
			table.table.getColumn("due")?.setFilterValue(value === ALL ? undefined : [value]);
		}}
	>
		{#each rangeOptions as option (option.value)}
			<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
		{/each}
	</NativeSelect.Root>
{/snippet}

<ListLayout
	{table}
	{facets}
	{tools}
	actions={[createOrdersAction]}
	searchLabel={m.maintenance_search()}
	emptyTitle={m.maintenance_empty()}
	filters={{
		customer: { load: getDueCustomerOptions, searchLabel: m.common_table_search_customers() },
		due: false,
	}}
/>
