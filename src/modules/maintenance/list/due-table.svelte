<script lang="ts">
	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { getCustomerOptions } from "#lib/components/data-table/filter-options.remote.ts";
	import { whereOf } from "#lib/components/data-table/list-definition.ts";
	import RecordFilter from "#lib/components/data-table/record-filter.svelte";
	import { serverTableLoading } from "#lib/components/data-table/server-table.svelte.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
	import { labelOptions } from "#lib/i18n/index.ts";

	import { maintenanceLabels } from "../labels.ts";
	import { dueRanges, planOrderTypes } from "../model.ts";
	import { createOrdersAction } from "./bulk-actions.ts";
	import { columns } from "./columns.ts";
	import type { getDueFacets, getDuePlans } from "./due-list.remote.ts";
	import { dueList } from "./due-list.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		plans,
		facets,
	}: {
		/** A page of due plans, as the URL says, and how many match in all. */
		plans: Awaited<ReturnType<typeof getDuePlans>>;
		/** How many plans have each order type. */
		facets: Awaited<ReturnType<typeof getDueFacets>>;
	} = $props();

	const table = createAppTable({
		columns,
		serverSide: true,
		get data() {
			return plans.rows;
		},
		get rowCount() {
			return plans.rowCount;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			// The next due first, overdue plus the next 30 days: the defaults the server has too.
			...dueList.urlSpec.defaults,
			// Only there to filter by.
			columnVisibility: { type: false, due: false },
		},
	});

	const loading = serverTableLoading(table, dueList, () => plans.key);

	/** "Every plan": no range at all. */
	const ALL = "all";
	const range = $derived(
		(table.getColumn("due")?.getFilterValue() as string[] | undefined)?.[0] ?? ALL,
	);
	const rangeOptions = $derived([
		...maintenanceLabels.labelOptions("dueRange", dueRanges),
		{ value: ALL, label: m.maintenance_range_all() },
	]);
	const typeOptions = $derived(labelOptions("orderType", planOrderTypes));
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<table.Toolbar searchLabel={m.maintenance_search()}>
			<FacetedFilter
				columnId="type"
				title={m.maintenance_field_order_type()}
				options={typeOptions}
				counts={facets.type}
			/>
			<RecordFilter
				columnId="customer"
				title={m.maintenance_column_customer()}
				searchLabel={m.common_table_search_customers()}
				load={getCustomerOptions}
			/>
			{#snippet actions()}
				<NativeSelect.Root
					size="sm"
					aria-label={m.maintenance_range()}
					value={range}
					onchange={(event) => {
						const value = event.currentTarget.value;
						table.getColumn("due")?.setFilterValue(value === ALL ? undefined : [value]);
					}}
				>
					{#each rangeOptions as option (option.value)}
						<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			{/snippet}
		</table.Toolbar>
		<table.Table emptyTitle={m.maintenance_empty()} fillViewport loading={loading.current} />
		<BulkActionBar
			actions={[createOrdersAction]}
			matching={{ where: whereOf(plans.query), key: plans.key, count: plans.rowCount }}
		/>
		<table.Pagination />
	</div>
</table.AppTable>
