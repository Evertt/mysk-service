<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { serverTableQuery } from "#lib/components/data-table/server-table.svelte.js";
	import PageHeader from "#lib/components/page-header.svelte";

	import EquipmentTable from "./equipment-table.svelte";
	import { equipmentUrl } from "./equipment-url.js";
	import { getEquipmentFacets, getEquipmentList } from "./equipment.remote.js";

	// The server pages, filters and sorts the units, as the URL says (see the orders page).
	const query = $derived(serverTableQuery(page.url.searchParams, equipmentUrl));
	// Both start at once.
	const equipment = $derived(getEquipmentList(query.rows));
	const facets = $derived(getEquipmentFacets(query.facets));
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
