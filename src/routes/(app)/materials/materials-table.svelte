<script lang="ts">
	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { whereOf } from "#lib/components/data-table/list-definition.js";
	import { serverTableLoading } from "#lib/components/data-table/server-table.svelte.js";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { stockLevelOptions, unitOptions } from "#lib/components/materials/display.js";

	import { deleteMaterials } from "./bulk-actions.js";
	import { columns } from "./columns.js";
	import type { getMaterialFacets, getMaterials } from "./material-list.remote.js";
	import { materialsList } from "./materials-list.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		materials,
		facets,
	}: {
		/** A page of materials, as the URL says, how many match in all, and its groups if grouped. */
		materials: Awaited<ReturnType<typeof getMaterials>>;
		/** How many materials have each value of the filters'. */
		facets: Awaited<ReturnType<typeof getMaterialFacets>>;
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
		// By name, 20 per page: the defaults the server has too.
		initialState: {
			...materialsList.urlSpec.defaults,
			columnVisibility: { sku: false, stockLevel: false },
		},
	});

	const loading = serverTableLoading(table, materialsList, () => materials.key);
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
		<table.Table
			emptyTitle={m.materials_empty()}
			fillViewport
			loading={loading.current}
			groups={materials.groups}
		/>
		<BulkActionBar
			actions={[deleteMaterials]}
			matching={{ where: whereOf(materials.query), key: materials.key, count: materials.rowCount }}
		/>
		<table.Pagination />
	</div>
</table.AppTable>
