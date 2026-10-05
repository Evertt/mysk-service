<script lang="ts">
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { stockLevelOptions, unitOptions } from "#lib/components/materials/display.js";

	import { columns, type MaterialRow } from "./columns.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { materials }: { materials: MaterialRow[] } = $props();

	const table = createAppTable({
		columns,
		get data() {
			return materials;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "name", desc: false }],
			columnVisibility: { sku: false, stockLevel: false },
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});
</script>

<table.AppTable>
	<div class="flex flex-col gap-4">
		<table.Toolbar searchLabel="Search materials…">
			<FacetedFilter columnId="unit" title="Unit" options={unitOptions} />
			<FacetedFilter columnId="stockLevel" title="Stock level" options={stockLevelOptions} />
		</table.Toolbar>
		<table.Table emptyTitle="No materials found" />
		<table.Pagination />
	</div>
</table.AppTable>
