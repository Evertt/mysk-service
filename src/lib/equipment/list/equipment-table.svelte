<script lang="ts">
	import { type Snippet, untrack } from "svelte";

	import type { List } from "#lib/components/data-table/list-definition.ts";
	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { withModuleTableColumns } from "#lib/components/data-table/module-table-columns.ts";
	import { createServerTable } from "#lib/components/data-table/server-table.svelte.ts";
	import { noneToken } from "#lib/components/data-table/url-state.ts";

	import type { getEquipmentCategories } from "../categories/categories.remote.ts";
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

	// The table is created here rather than in the page because making the table sets context,
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

	const table = createServerTable({
		list,
		first: () => equipment,
		fetch: getEquipmentList,
		columns: withModuleTableColumns<EquipmentRow, (typeof columns)[number]>(
			columns,
			list.moduleColumns,
		),
		// By unit: the default the server has too. Only there to search and filter by: the unit
		// column shows them.
		initialState: { columnVisibility: { serialNumber: false, manufacturer: false } },
	});

	const tickedManufacturers = $derived(
		(table.table.getColumn("manufacturer")?.getFilterValue() as string[] | undefined) ?? [],
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
</script>

{#snippet chips()}
	<CategoryChips {categories} counts={facets.category} />
{/snippet}

{#snippet above()}
	{#if header}
		{@render header(chips)}
	{:else}
		{@render chips()}
	{/if}
{/snippet}

<ListLayout
	{table}
	{facets}
	header={above}
	actions={[changeStatus, deleteEquipment]}
	searchLabel={m.equipment_search()}
	emptyTitle={m.equipment_empty()}
	filters={{
		category: { options: categoryOptions },
		manufacturer: { options: manufacturerOptions, none: noManufacturer },
		customer: {
			load: getEquipmentCustomerOptions,
			searchLabel: m.common_table_search_customers(),
		},
		location: { load: getEquipmentLocationOptions, searchLabel: m.equipment_search_locations() },
		installedAt: {
			presets: ["this-month", "last-month", "last-30-days", "this-year", "last-year"],
		},
		warrantyUntil: {
			presets: [
				"before-today",
				"from-today",
				"next-30-days",
				"this-month",
				"next-month",
				"this-year",
			],
		},
		openOrders: { step: 1, min: 0 },
	}}
/>
