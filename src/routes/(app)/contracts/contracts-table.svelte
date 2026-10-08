<script lang="ts">
	import { levelOptions, statusOptions } from "#lib/components/contracts/display.js";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";

	import { columns, type ContractRow } from "./columns.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { contracts }: { contracts: ContractRow[] } = $props();

	const table = createAppTable({
		columns,
		get data() {
			return contracts;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "period", desc: true }],
			columnVisibility: { createdAt: false },
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<table.Toolbar searchLabel={m.contracts_search()}>
			<FacetedFilter columnId="status" title={m.contracts_status()} options={statusOptions} />
			<FacetedFilter columnId="level" title={m.contracts_level()} options={levelOptions} />
		</table.Toolbar>
		<table.Table emptyTitle={m.contracts_empty()} fillViewport />
		<table.Pagination />
	</div>
</table.AppTable>
