<script lang="ts">
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import RecordFilter from "#lib/components/data-table/record-filter.svelte";
	import { serverTableLoading } from "#lib/components/data-table/server-table.svelte.js";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { categoryOptions, statusOptions } from "#lib/components/equipment/display.js";

	import { getCustomerOptions } from "../filter-options.remote.js";
	import { columns, type EquipmentRow } from "./columns.js";
	import { equipmentUrl } from "./equipment-url.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		equipment,
		facets,
	}: {
		/** A page of units, as the URL says, and how many match in all. */
		equipment: { rows: EquipmentRow[]; rowCount: number; key: string };
		/** How many units have each value of the filters'. */
		facets: Record<"category" | "status" | "manufacturer", Record<string, number>>;
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
			sorting: [{ id: "unit", desc: false }],
			// Only there to search and filter by; the unit column shows them.
			columnVisibility: { serialNumber: false, manufacturer: false },
			pagination: { pageIndex: 0, pageSize: 20 },
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

	const loading = serverTableLoading(table, equipmentUrl, () => equipment.key);
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
		<table.Table emptyTitle={m.equipment_empty()} fillViewport loading={loading.current} />
		<table.Pagination />
	</div>
</table.AppTable>
