<script lang="ts">
	import { untrack } from "svelte";

	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import DateRangeFilter from "#lib/components/data-table/date-range-filter.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { getCustomerOptions } from "#lib/components/data-table/filter-options.remote.ts";
	import { type List, whereOf } from "#lib/components/data-table/list-definition.ts";
	import { withModuleTableColumns } from "#lib/components/data-table/module-table-columns.ts";
	import NumberRangeFilter from "#lib/components/data-table/number-range-filter.svelte";
	import RecordFilter from "#lib/components/data-table/record-filter.svelte";
	import {
		scrollPages,
		serverTableLoading,
	} from "#lib/components/data-table/server-table.svelte.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";

	import { categoryOptions, statusOptions } from "../display.ts";
	import { changeStatus, deleteEquipment } from "./bulk-actions.ts";
	import { columns, type EquipmentRow } from "./columns.ts";
	import { type getEquipmentFacets, getEquipmentList } from "./equipment-list.remote.ts";
	import type { equipmentList } from "./equipment-list.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		list: given,
		equipment,
		facets,
	}: {
		/** The equipment list with the tenant's modules' columns (`extendList()`). */
		list: List<typeof equipmentList.columns>;
		/**
		 * The first page of units, as the URL says, how many match in all, and its groups when
		 * grouped: the table loads the next as it's scrolled.
		 */
		equipment: Awaited<ReturnType<typeof getEquipmentList>>;
		/** How many units have each value of the filters'. */
		facets: Awaited<ReturnType<typeof getEquipmentFacets>>;
	} = $props();

	// The tenant's, which don't change while the page is open (switching organization reloads it).
	const list = untrack(() => given);
	// The modules' columns with a filter, and its options.
	const moduleFilters = list.moduleColumns.flatMap((column) =>
		column.filter?.values
			? [
					{
						column,
						options: column.filter.values.map((value) => ({
							value,
							label: column.optionLabel?.(value) ?? value,
						})),
					},
				]
			: [],
	);

	const pages = scrollPages({ first: () => equipment, fetch: getEquipmentList });

	const table = createAppTable({
		columns: withModuleTableColumns<EquipmentRow, (typeof columns)[number]>(
			columns,
			list.moduleColumns,
		),
		serverSide: true,
		scroll: pages,
		get data() {
			return pages.rows;
		},
		get rowCount() {
			return pages.rowCount;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			// By unit: the default the server has too.
			...list.urlSpec.defaults,
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

	const loading = serverTableLoading(table, list, () => pages.key);
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
			<DateRangeFilter
				columnId="installedAt"
				title={m.equipment_column_installed()}
				presets={["this-month", "last-month", "last-30-days", "this-year", "last-year"]}
			/>
			<DateRangeFilter
				columnId="warrantyUntil"
				title={m.equipment_column_warranty()}
				presets={[
					"before-today",
					"from-today",
					"next-30-days",
					"this-month",
					"next-month",
					"this-year",
				]}
			/>
			<NumberRangeFilter
				columnId="openOrders"
				title={m.equipment_column_open_orders()}
				step={1}
				min={0}
			/>
			{#each moduleFilters as { column, options } (column.id)}
				<FacetedFilter
					columnId={column.id}
					title={column.label()}
					{options}
					counts={facets[column.id] ?? {}}
				/>
			{/each}
		</table.Toolbar>
		<table.Table
			emptyTitle={m.equipment_empty()}
			fillViewport
			loading={loading.current}
			groups={pages.groups}
		/>
		<BulkActionBar
			actions={[changeStatus, deleteEquipment]}
			matching={{ where: whereOf(equipment.query), key: equipment.key, count: equipment.rowCount }}
		/>
		<table.Footer />
	</div>
</table.AppTable>
