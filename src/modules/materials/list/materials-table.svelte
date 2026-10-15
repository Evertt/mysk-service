<script lang="ts">
	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { whereOf } from "#lib/components/data-table/list-definition.ts";
	import NumberRangeFilter from "#lib/components/data-table/number-range-filter.svelte";
	import {
		scrollPages,
		serverTableLoading,
	} from "#lib/components/data-table/server-table.svelte.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";

	import { stockLevelOptions, unitOptions } from "../display.ts";
	import { deleteMaterials } from "./bulk-actions.ts";
	import { columns } from "./columns.ts";
	import { type getMaterialFacets, getMaterials } from "./material-list.remote.ts";
	import { materialsList } from "./materials-list.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		materials,
		facets,
	}: {
		/**
		 * The first page of materials, as the URL says, how many match in all, and its groups if
		 * grouped: the table loads the next as it's scrolled.
		 */
		materials: Awaited<ReturnType<typeof getMaterials>>;
		/** How many materials have each value of the filters'. */
		facets: Awaited<ReturnType<typeof getMaterialFacets>>;
	} = $props();

	const pages = scrollPages({ first: () => materials, fetch: getMaterials });

	const table = createAppTable({
		columns,
		serverSide: true,
		scroll: pages,
		get data() {
			return pages.rows;
		},
		get rowCount() {
			return pages.rowCount;
		},
		getRowId: (row) => String(row.id),
		// By name: the default the server has too.
		initialState: {
			...materialsList.urlSpec.defaults,
			columnVisibility: { sku: false, stockLevel: false },
		},
	});

	const loading = serverTableLoading(table, materialsList, () => pages.key);
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
			<NumberRangeFilter columnId="unitPrice" title={m.materials_unit_price()} money min={0} />
			<NumberRangeFilter columnId="stock" title={m.materials_stock()} min={0} />
			<NumberRangeFilter columnId="orderCount" title={m.materials_used_on()} step={1} min={0} />
		</table.Toolbar>
		<table.Table
			emptyTitle={m.materials_empty()}
			fillViewport
			loading={loading.current}
			groups={pages.groups}
		/>
		<BulkActionBar
			actions={[deleteMaterials]}
			matching={{ where: whereOf(materials.query), key: materials.key, count: materials.rowCount }}
		/>
		<table.Footer />
	</div>
</table.AppTable>
