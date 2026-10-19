<script lang="ts">
	import { type Snippet, untrack } from "svelte";

	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import DateRangeFilter from "#lib/components/data-table/date-range-filter.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { type List, whereOf } from "#lib/components/data-table/list-definition.ts";
	import { withModuleTableColumns } from "#lib/components/data-table/module-table-columns.ts";
	import NumberRangeFilter from "#lib/components/data-table/number-range-filter.svelte";
	import RecordFilter from "#lib/components/data-table/record-filter.svelte";
	import {
		recordOptions,
		scrollPages,
		serverTableLoading,
	} from "#lib/components/data-table/server-table.svelte.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
	import { noneToken } from "#lib/components/data-table/url-state.ts";

	import type { getEquipmentCategories } from "../categories/categories.remote.ts";
	import { statusOptions } from "../display.ts";
	import { changeStatus, deleteEquipment } from "./bulk-actions.ts";
	import CategoryChips from "./category-chips.svelte";
	import { columns, type EquipmentRow } from "./columns.ts";
	import {
		getEquipmentCustomerOptions,
		type getEquipmentFacets,
		getEquipmentList,
		getEquipmentLocationOptions,
	} from "./equipment-list.remote.ts";
	import type { equipmentList } from "./equipment-list.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		list: given,
		equipment,
		facets,
		categories,
		header,
	}: {
		/** The equipment list with the tenant's modules' columns (`extendList()`). */
		list: List<typeof equipmentList.columns>;
		/**
		 * The first page of units, as the URL says, how many match in all, and its groups when
		 * grouped: the table loads the next as it's scrolled.
		 */
		equipment: Awaited<ReturnType<typeof getEquipmentList>>;
		/** How many units have each category, status and manufacturer (and module column's value). */
		facets: Awaited<ReturnType<typeof getEquipmentFacets>>;
		/** The tenant's categories in their order, for the category filter and its chips. */
		categories: Awaited<ReturnType<typeof getEquipmentCategories>>;
		/**
		 * Above the table, in its context: the page's band, given the category chips to show (they
		 * set the table's filter). Without it, the chips stand on their own.
		 */
		header?: Snippet<[chips: Snippet]>;
	} = $props();

	// By id, as the URL has them.
	const categoryOptions = $derived(
		categories.map((category) => ({ value: String(category.id), label: category.name })),
	);

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

	const tickedManufacturers = $derived(
		(table.getColumn("manufacturer")?.getFilterValue() as string[] | undefined) ?? [],
	);
	// The manufacturers that the search and the other filters leave, and those ticked.
	const manufacturerOptions = $derived(
		[...new Set([...Object.keys(facets.manufacturer), ...tickedManufacturers])]
			.filter((value) => value !== noneToken)
			.sort((a, b) => a.localeCompare(b))
			.map((value) => ({ value, label: value })),
	);
	// The units without one, where there are any (imported units may have none).
	const noManufacturer = $derived(
		noneToken in facets.manufacturer || tickedManufacturers.includes(noneToken),
	);

	// The filters on related records, counted under the list's search and other filters.
	const where = () => whereOf(equipment.query);
	const customerOptions = recordOptions(getEquipmentCustomerOptions, where, "customer");
	const locationOptions = recordOptions(getEquipmentLocationOptions, where, "location");

	const loading = serverTableLoading(table, list, () => pages.key);
</script>

{#snippet chips()}
	<CategoryChips {categories} counts={facets.category} />
{/snippet}

<table.AppTable>
	<div class="flex min-h-0 flex-1 flex-col gap-4">
		{#if header}
			{@render header(chips)}
		{:else}
			{@render chips()}
		{/if}
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
				none={noManufacturer ? m.equipment_manufacturer_none() : undefined}
			/>
			<RecordFilter
				columnId="customer"
				title={m.equipment_column_customer()}
				searchLabel={m.common_table_search_customers()}
				load={customerOptions.current}
			/>
			<RecordFilter
				columnId="location"
				title={m.equipment_column_location()}
				searchLabel={m.equipment_search_locations()}
				load={locationOptions.current}
				none={m.equipment_location_none()}
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
	</div>
</table.AppTable>
