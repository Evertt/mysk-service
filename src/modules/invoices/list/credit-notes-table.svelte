<script lang="ts">
	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { customerFacets } from "#lib/components/data-table/record-facets.ts";
	import { createClientTable } from "#lib/components/data-table/table.svelte.ts";

	import { creditNoteColumns, type CreditNoteRow } from "./credit-note-columns.ts";
	import { creditNotesList } from "./credit-notes-list.ts";

	// Made here rather than in the page: making the table sets context, which Svelte doesn't allow
	// after the page's `await`.
	let { creditNotes }: { creditNotes: CreditNoteRow[] } = $props();

	const table = createClientTable({
		list: creditNotesList,
		data: () => creditNotes,
		columns: creditNoteColumns,
		initialState: { columnVisibility: { createdAt: false, settlement: false } },
	});
</script>

<ListLayout
	{table}
	searchLabel={m.invoices_credit_search()}
	emptyTitle={m.invoices_credit_empty()}
	filters={{ customer: { options: customerFacets(table.table) } }}
/>
