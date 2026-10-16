<script lang="ts">
	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import DateRangeFilter from "#lib/components/data-table/date-range-filter.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import NumberRangeFilter from "#lib/components/data-table/number-range-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";

	import { countryOptions } from "../countries.ts";
	import { segmentOptions } from "../display.ts";
	import { deleteCustomers } from "./bulk-actions.ts";
	import { columns, type CustomerRow } from "./columns.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { customers }: { customers: CustomerRow[] } = $props();

	const countries = $derived(countryOptions(customers.map((c) => c.country)));

	const table = createAppTable({
		columns,
		get data() {
			return customers;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "name", desc: false }],
			columnVisibility: { createdAt: false, search: false },
		},
	});
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<table.Toolbar searchLabel={m.customers_search()}>
			<FacetedFilter
				columnId="segment"
				title={m.customers_column_segment()}
				options={segmentOptions}
			/>
			<FacetedFilter columnId="country" title={m.customers_column_country()} options={countries} />
			<NumberRangeFilter
				columnId="equipmentCount"
				title={m.customers_column_equipment()}
				step={1}
				min={0}
			/>
			<NumberRangeFilter
				columnId="openOrders"
				title={m.customers_column_open_orders()}
				step={1}
				min={0}
			/>
			<DateRangeFilter
				columnId="createdAt"
				title={m.customers_column_since()}
				presets={["this-week", "this-month", "last-30-days", "this-year", "last-year"]}
			/>
		</table.Toolbar>
		<table.Table emptyTitle={m.customers_empty()} fillViewport />
		<BulkActionBar actions={[deleteCustomers]} />
	</div>
</table.AppTable>
