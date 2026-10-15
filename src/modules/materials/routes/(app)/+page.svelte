<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { toListQuery, whereOf } from "#lib/components/data-table/list-definition.ts";
	import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { getMaterialFacets, getMaterials } from "#modules/materials/list/material-list.remote.ts";
	import { materialsList } from "#modules/materials/list/materials-list.ts";
	import MaterialsTable from "#modules/materials/list/materials-table.svelte";

	const _props: { params: RouteParams<"/(app)/(modules)/materials"> } = $props();

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
		<Button href={resolve("/(app)/(modules)/materials/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.materials_new()}
		</Button>
	{/snippet}
</PageHeader>

<MaterialsTable materials={await materials} facets={await facets} />
