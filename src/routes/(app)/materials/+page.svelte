<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { toListQuery, whereOf } from "#lib/components/data-table/list-definition.js";
	import { parseTableUrl } from "#lib/components/data-table/url-state.js";
	import PageHeader from "#lib/components/page-header.svelte";

	import { getMaterialFacets, getMaterials } from "./material-list.remote.js";
	import { materialsList } from "./materials-list.js";
	import MaterialsTable from "./materials-table.svelte";

	// The server pages, filters and sorts the materials, as the URL says (see the orders page).
	const query = $derived(
		toListQuery(materialsList, parseTableUrl(page.url.searchParams, materialsList.urlSpec)),
	);
	// Both start at once.
	const materials = $derived(getMaterials(query));
	const facets = $derived(getMaterialFacets(whereOf(query)));
</script>

<svelte:head>
	<title>{m.materials_title()}</title>
</svelte:head>

<PageHeader title={m.materials_title()} description={m.materials_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/materials/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.materials_new()}
		</Button>
	{/snippet}
</PageHeader>

<MaterialsTable materials={await materials} facets={await facets} />
