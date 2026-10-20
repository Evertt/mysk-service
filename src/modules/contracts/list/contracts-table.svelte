<script lang="ts">
	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { customerFacets } from "#lib/components/data-table/record-facets.ts";
	import { createClientTable } from "#lib/components/data-table/table.svelte.ts";

	import { deleteContracts } from "./bulk-actions.ts";
	import { columns, type ContractRow } from "./columns.ts";
	import { contractsList } from "./contracts-list.ts";

	// The table is created here rather than in the page because making the table sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { contracts }: { contracts: ContractRow[] } = $props();

	const table = createClientTable({
		list: contractsList,
		data: () => contracts,
		columns,
		initialState: { columnVisibility: { createdAt: false } },
	});
</script>

<ListLayout
	{table}
	actions={[deleteContracts]}
	searchLabel={m.contracts_search()}
	emptyTitle={m.contracts_empty()}
	filters={{ customer: { options: customerFacets(table.table) }, monthlyFee: { min: 0 } }}
/>
