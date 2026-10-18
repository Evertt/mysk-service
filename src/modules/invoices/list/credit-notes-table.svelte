<script lang="ts">
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { recordFacets } from "#lib/components/data-table/record-facets.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";

	import { creditStateOptions } from "../display.ts";
	import { creditNoteColumns, type CreditNoteRow } from "./credit-note-columns.ts";

	// Made here rather than in the page: `createAppTable` sets context, which Svelte doesn't allow
	// after the page's `await`.
	let { creditNotes }: { creditNotes: CreditNoteRow[] } = $props();

	const table = createAppTable({
		columns: creditNoteColumns,
		get data() {
			return creditNotes;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "number", desc: true }],
			columnVisibility: { createdAt: false },
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
	<div class="flex min-h-0 flex-1 flex-col gap-4">
		<table.Toolbar searchLabel={m.invoices_credit_search()}>
			<FacetedFilter
				columnId="status"
				title={m.invoices_column_status()}
				options={creditStateOptions}
			/>
			<FacetedFilter
				columnId="customer"
				title={m.invoices_column_customer()}
				options={customers.options}
				counts={customers.counts}
			/>
		</table.Toolbar>
		<table.Table emptyTitle={m.invoices_credit_empty()} fillViewport />
	</div>
</table.AppTable>
