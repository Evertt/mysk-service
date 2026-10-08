<script lang="ts">
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { serverTableLoading } from "#lib/components/data-table/server-table.svelte.js";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { stockLevelOptions, unitOptions } from "#lib/components/materials/display.js";

	import { columns, type MaterialRow } from "./columns.js";
	import { materialsUrl } from "./materials-url.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		materials,
		facets,
	}: {
		/** A page of materials, as the URL says, and how many match in all. */
		materials: { rows: MaterialRow[]; rowCount: number; key: string };
		/** How many materials have each value of the filters'. */
		facets: Record<"unit" | "stockLevel", Record<string, number>>;
	} = $props();

	const table = createAppTable({
		columns,
		serverSide: true,
		get data() {
			return materials.rows;
		},
		get rowCount() {
			return materials.rowCount;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "name", desc: false }],
			columnVisibility: { sku: false, stockLevel: false },
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});

	const loading = serverTableLoading(table, materialsUrl, () => materials.key);
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<table.Toolbar searchLabel={m.materials_search()}>
			<FacetedFilter
				columnId="unit"
				title={m.materials_unit()}
				options={unitOptions}
				counts={facets.unit}
			/>
			<FacetedFilter
				columnId="stockLevel"
				title={m.materials_stock_level()}
				options={stockLevelOptions}
				counts={facets.stockLevel}
			/>
		</table.Toolbar>
		<table.Table emptyTitle={m.materials_empty()} fillViewport loading={loading.current} />
		<table.Pagination />
	</div>
</table.AppTable>
