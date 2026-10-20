<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import WrenchIcon from "@lucide/svelte/icons/wrench";

	import { extendList, whereOf } from "#lib/components/data-table/list-definition.ts";
	import { urlListQuery } from "#lib/components/data-table/server-table.svelte.ts";
	import ToolbarBand, { bandButton } from "#lib/components/toolbar-band.svelte";
	import { EquipmentTable } from "#lib/equipment/components.ts";
	import { points } from "#lib/equipment/extensions.ts";
	import { equipmentList } from "#lib/equipment/index.ts";
	import {
		getEquipmentCategories,
		getEquipmentFacets,
		getEquipmentList,
	} from "#lib/equipment/remotes.ts";
	import { loadListColumns } from "#lib/extensions/list-columns.ts";

	// The list with the columns of the tenant's modules (e.g. the next maintenance), whose
	// parameters the URL may hold.
	const list = $derived(extendList(equipmentList, await loadListColumns(points.list.columns)));
	// The server filters, sorts and pages the units, as the URL says (see the orders page).
	const listQuery = urlListQuery(() => list);
	const query = $derived(listQuery.current);
	// Both start at once.
	const equipment = $derived(getEquipmentList(query));
	const facets = $derived(getEquipmentFacets(whereOf(query)));
	const categories = getEquipmentCategories();
	const shown = $derived(await equipment);
</script>

<svelte:head>
	<title>{m.equipment_title()}</title>
</svelte:head>

<!-- The band with the units the list leaves, and the category chips under it (in the table's
	context: they set its filter). -->
<EquipmentTable {list} equipment={shown} facets={await facets} categories={await categories}>
	{#snippet header(chips)}
		<ToolbarBand
			title={m.equipment_title()}
			icon={WrenchIcon}
			count={m.common_count_units({ count: shown.rowCount })}
			description={m.equipment_description()}
		>
			{#snippet actions()}
				<Button href={resolve("/(app)/equipment/new")} variant="ghost" class={bandButton}>
					<PlusIcon data-icon="inline-start" />
					{m.equipment_new()}
				</Button>
			{/snippet}
			{@render chips()}
		</ToolbarBand>
	{/snippet}
</EquipmentTable>
