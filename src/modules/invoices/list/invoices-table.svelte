<script lang="ts">
	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { customerFacets } from "#lib/components/data-table/record-facets.ts";
	import { createClientTable } from "#lib/components/data-table/table.svelte.ts";

	import { markPaid } from "./bulk-actions.ts";
	import { columns, type InvoiceRow } from "./columns.ts";
	import { invoicesList } from "./invoices-list.ts";

	// The table is created here rather than in the page because making the table sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { invoices }: { invoices: InvoiceRow[] } = $props();

	const table = createClientTable({
		list: invoicesList,
		data: () => invoices,
		columns,
		initialState: { columnVisibility: { createdAt: false } },
	});
</script>

<ListLayout
	{table}
	actions={[markPaid]}
	searchLabel={m.invoices_search()}
	emptyTitle={m.invoices_empty()}
	filters={{
		customer: { options: customerFacets(table.table) },
		dueOn: { presets: ["before-today", "from-today", "this-week", "next-7-days", "this-month"] },
	}}
/>
