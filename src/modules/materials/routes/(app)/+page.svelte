<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { whereOf } from "#lib/components/data-table/list-definition.ts";
	import { urlListQuery } from "#lib/components/data-table/server-table.svelte.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { getMaterialFacets, getMaterials } from "#modules/materials/list/material-list.remote.ts";
	import { materialsList } from "#modules/materials/list/materials-list.ts";
	import MaterialsTable from "#modules/materials/list/materials-table.svelte";

	const _props: { params: RouteParams<"/(app)/(modules)/materials"> } = $props();

	// The server filters, sorts and pages the materials, as the URL says (see the orders page).
	const listQuery = urlListQuery(() => materialsList);
	const query = $derived(listQuery.current);
	// Both start at once.
	const materials = $derived(getMaterials(query));
	const facets = $derived(getMaterialFacets(whereOf(query)));
</script>

<PageHeader title={m.materials_title()} description={m.materials_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/(modules)/materials/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.materials_new()}
		</Button>
	{/snippet}
</PageHeader>

<MaterialsTable materials={await materials} facets={await facets} />
