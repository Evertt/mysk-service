<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { listQueries } from "#lib/components/data-table/server-table.svelte.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { getMaterialFacets, getMaterials } from "#modules/materials/list/material-list.remote.ts";
	import { materialsList } from "#modules/materials/list/materials-list.ts";
	import MaterialsTable from "#modules/materials/list/materials-table.svelte";

	const _props: { params: RouteParams<"/(app)/(modules)/materials"> } = $props();

	// The server filters, sorts and pages the materials, as the URL says (see the orders page).
	const materials = listQueries(() => materialsList, getMaterials, getMaterialFacets);
</script>

<PageHeader title={m.materials_title()} description={m.materials_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/(modules)/materials/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.materials_new()}
		</Button>
	{/snippet}
</PageHeader>

<MaterialsTable materials={await materials.rows} facets={await materials.facets} />
