<script lang="ts">
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { categoryOptions, statusOptions } from "#lib/components/equipment/display.js";

	import { columns, type EquipmentRow } from "./columns.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { equipment }: { equipment: EquipmentRow[] } = $props();

	const table = createAppTable({
		columns,
		get data() {
			return equipment;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "unit", desc: false }],
			// Only there to search and filter by; the unit column shows them.
			columnVisibility: { serialNumber: false, manufacturer: false },
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});

	const manufacturerOptions = $derived(
		[...new Set(equipment.map((unit) => unit.manufacturer))]
			.sort((a, b) => a.localeCompare(b))
			.map((value) => ({ value, label: value })),
	);
</script>

<table.AppTable>
	<div class="flex flex-col gap-4">
		<table.Toolbar searchLabel={m.equipment_search()}>
			<FacetedFilter
				columnId="category"
				title={m.equipment_column_category()}
				options={categoryOptions}
			/>
			<FacetedFilter
				columnId="status"
				title={m.equipment_column_status()}
				options={statusOptions}
			/>
			<FacetedFilter
				columnId="manufacturer"
				title={m.equipment_column_manufacturer()}
				options={manufacturerOptions}
			/>
		</table.Toolbar>
		<table.Table emptyTitle={m.equipment_empty()} />
		<table.Pagination />
	</div>
</table.AppTable>
