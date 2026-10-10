<script lang="ts">
	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { getCustomerOptions } from "#lib/components/data-table/filter-options.remote.ts";
	import { whereOf } from "#lib/components/data-table/list-definition.ts";
	import RecordFilter from "#lib/components/data-table/record-filter.svelte";
	import { serverTableLoading } from "#lib/components/data-table/server-table.svelte.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
	import { categoryOptions, statusOptions } from "#lib/equipment/index.ts";

	import { changeStatus, deleteEquipment } from "./bulk-actions.ts";
	import { columns } from "./columns.ts";
	import type { getEquipmentFacets, getEquipmentList } from "./equipment-list.remote.ts";
	import { equipmentList } from "./equipment-list.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		equipment,
		facets,
	}: {
		/** A page of units, as the URL says, how many match in all, and its groups when grouped. */
		equipment: Awaited<ReturnType<typeof getEquipmentList>>;
		/** How many units have each value of the filters'. */
		facets: Awaited<ReturnType<typeof getEquipmentFacets>>;
	} = $props();

	const table = createAppTable({
		columns,
		serverSide: true,
		get data() {
			return equipment.rows;
		},
		get rowCount() {
			return equipment.rowCount;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			// By unit, 20 per page: the defaults the server has too.
			...equipmentList.urlSpec.defaults,
			// Only there to search and filter by; the unit column shows them.
			columnVisibility: { serialNumber: false, manufacturer: false },
		},
	});

	// The manufacturers that the search and the other filters leave, and those ticked.
	const manufacturerOptions = $derived.by(() => {
		const ticked =
			(table.getColumn("manufacturer")?.getFilterValue() as string[] | undefined) ?? [];
		return [...new Set([...Object.keys(facets.manufacturer), ...ticked])]
			.sort((a, b) => a.localeCompare(b))
			.map((value) => ({ value, label: value }));
	});

	const loading = serverTableLoading(table, equipmentList, () => equipment.key);
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<table.Toolbar searchLabel={m.equipment_search()}>
			<FacetedFilter
				columnId="category"
				title={m.equipment_column_category()}
				options={categoryOptions}
				counts={facets.category}
			/>
			<FacetedFilter
				columnId="status"
				title={m.equipment_column_status()}
				options={statusOptions}
				counts={facets.status}
			/>
			<FacetedFilter
				columnId="manufacturer"
				title={m.equipment_column_manufacturer()}
				options={manufacturerOptions}
				counts={facets.manufacturer}
			/>
			<RecordFilter
				columnId="customer"
				title={m.equipment_column_customer()}
				searchLabel={m.common_table_search_customers()}
				load={getCustomerOptions}
			/>
		</table.Toolbar>
		<table.Table
			emptyTitle={m.equipment_empty()}
			fillViewport
			loading={loading.current}
			groups={equipment.groups}
		/>
		<BulkActionBar
			actions={[changeStatus, deleteEquipment]}
			matching={{ where: whereOf(equipment.query), key: equipment.key, count: equipment.rowCount }}
		/>
		<table.Pagination />
	</div>
</table.AppTable>
