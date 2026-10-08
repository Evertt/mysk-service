<script lang="ts">
	import { page } from "$app/state";

	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { stateOptions } from "#lib/components/invoicing/display.js";
	import { type InvoiceState, invoiceStates } from "#lib/components/invoicing/invoice.js";

	import { columns, type InvoiceRow } from "./columns.js";

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

	// E.g. `?status=overdue` (from the dashboard) starts filtered on those. Set rather than part of
	// the initial state, which the toolbar's reset would return to.
	const statuses = page.url.searchParams
		.getAll("status")
		.filter((state): state is InvoiceState => (invoiceStates as readonly string[]).includes(state));
	if (statuses.length) table.getColumn("status")?.setFilterValue(statuses);
</script>

<table.AppTable>
	<div class="flex flex-col gap-4">
		<table.Toolbar searchLabel={m.invoices_search()}>
			<FacetedFilter columnId="status" title={m.invoices_column_status()} options={stateOptions} />
		</table.Toolbar>
		<table.Table emptyTitle={m.invoices_empty()} />
		<table.Pagination />
	</div>
</table.AppTable>
