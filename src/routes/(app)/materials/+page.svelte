<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { serverTableQuery } from "#lib/components/data-table/server-table.svelte.js";
	import PageHeader from "#lib/components/page-header.svelte";

	import { getMaterialFacets, getMaterials } from "./material-list.remote.js";
	import MaterialsTable from "./materials-table.svelte";
	import { materialsUrl } from "./materials-url.js";

	// The server pages, filters and sorts the materials, as the URL says (see the orders page).
	const query = $derived(serverTableQuery(page.url.searchParams, materialsUrl));
	// Both start at once.
	const materials = $derived(getMaterials(query.rows));
	const facets = $derived(getMaterialFacets(query.facets));
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
