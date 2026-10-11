<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { extendList, toListQuery, whereOf } from "#lib/components/data-table/list-definition.ts";
	import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { EquipmentTable } from "#lib/equipment/components.ts";
	import { listColumns } from "#lib/equipment/extensions.ts";
	import { equipmentList } from "#lib/equipment/index.ts";
	import { getEquipmentFacets, getEquipmentList } from "#lib/equipment/remotes.ts";
	import { loadListColumns } from "#lib/extensions/list-columns.ts";

	// The list with the columns of the tenant's modules (e.g. the next maintenance), whose
	// parameters the URL may hold.
	const list = $derived(extendList(equipmentList, await loadListColumns(listColumns)));
	// The server pages, filters and sorts the units, as the URL says (see the orders page).
	const query = $derived(toListQuery(list, parseTableUrl(page.url.searchParams, list.urlSpec)));
	// Both start at once.
	const equipment = $derived(getEquipmentList(query));
	const facets = $derived(getEquipmentFacets(whereOf(query)));
</script>

<svelte:head>
	<title>{m.equipment_title()}</title>
</svelte:head>

<PageHeader title={m.equipment_title()} description={m.equipment_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/equipment/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.equipment_new()}
		</Button>
	{/snippet}
</PageHeader>

<EquipmentTable {list} equipment={await equipment} facets={await facets} />
