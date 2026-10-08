<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { toListQuery, whereOf } from "#lib/components/data-table/list-definition.js";
	import { parseTableUrl } from "#lib/components/data-table/url-state.js";
	import PageHeader from "#lib/components/page-header.svelte";

	import { equipmentList } from "./equipment-list.js";
	import { getEquipmentFacets, getEquipmentList } from "./equipment-list.remote.js";
	import EquipmentTable from "./equipment-table.svelte";

	// The server pages, filters and sorts the units, as the URL says (see the orders page).
	const query = $derived(
		toListQuery(equipmentList, parseTableUrl(page.url.searchParams, equipmentList.urlSpec)),
	);
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

<EquipmentTable equipment={await equipment} facets={await facets} />
