<script lang="ts">
	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { createServerTable } from "#lib/components/data-table/server-table.svelte.ts";

	import { deleteMaterials } from "./bulk-actions.ts";
	import { columns } from "./columns.ts";
	import { type getMaterialFacets, getMaterials } from "./material-list.remote.ts";
	import { materialsList } from "./materials-list.ts";

	// The table is created here rather than in the page because making the table sets context,
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

	// By name: the default the server has too.
	const table = createServerTable({
		list: materialsList,
		first: () => materials,
		fetch: getMaterials,
		columns,
		initialState: { columnVisibility: { sku: false, stockLevel: false } },
	});
</script>

<ListLayout
	{table}
	{facets}
	actions={[deleteMaterials]}
	searchLabel={m.materials_search()}
	emptyTitle={m.materials_empty()}
	filters={{
		unitPrice: { min: 0 },
		stock: { min: 0 },
		orderCount: { step: 1, min: 0 },
	}}
/>
