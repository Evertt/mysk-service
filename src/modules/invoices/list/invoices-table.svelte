<script lang="ts">
	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import DateRangeFilter from "#lib/components/data-table/date-range-filter.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import NumberRangeFilter from "#lib/components/data-table/number-range-filter.svelte";
	import { recordFacets } from "#lib/components/data-table/record-facets.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";

	import { stateOptions } from "../display.ts";
	import { markPaid } from "./bulk-actions.ts";
	import { columns, type InvoiceRow } from "./columns.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { invoices }: { invoices: InvoiceRow[] } = $props();

	const table = createAppTable({
		columns,
		get data() {
			return invoices;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "number", desc: true }],
			columnVisibility: { createdAt: false },
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});

	const customers = $derived(
		recordFacets(table, "customer", (row) => ({
			value: row.customer.code,
			label: row.customer.name,
			detail: row.customer.code,
		})),
	);
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<table.Toolbar searchLabel={m.invoices_search()}>
			<FacetedFilter columnId="status" title={m.invoices_column_status()} options={stateOptions} />
			<FacetedFilter
				columnId="customer"
				title={m.invoices_column_customer()}
				options={customers.options}
				counts={customers.counts}
			/>
			<NumberRangeFilter columnId="total" title={m.invoices_column_total()} money />
			<DateRangeFilter
				columnId="dueOn"
				title={m.invoices_column_due()}
				presets={["before-today", "from-today", "this-week", "next-7-days", "this-month"]}
				none={m.invoices_state_draft()}
			/>
		</table.Toolbar>
		<table.Table emptyTitle={m.invoices_empty()} fillViewport />
		<BulkActionBar actions={[markPaid]} />
		<table.Pagination />
	</div>
</table.AppTable>
