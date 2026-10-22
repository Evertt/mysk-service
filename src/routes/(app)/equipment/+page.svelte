<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import WrenchIcon from "@lucide/svelte/icons/wrench";

	import { getTenantModules } from "#lib/auth/session.remote.ts";
	import { extendList } from "#lib/components/data-table/list-definition.ts";
	import { listQueries } from "#lib/components/data-table/server-table.svelte.ts";
	import ToolbarBand, { bandButton } from "#lib/components/toolbar-band.svelte";
	import { EquipmentTable } from "#lib/equipment/components.ts";
	import { points } from "#lib/equipment/extensions.ts";
	import { equipmentList } from "#lib/equipment/index.ts";
	import {
		getEquipmentCategories,
		getEquipmentFacets,
		getEquipmentList,
	} from "#lib/equipment/remotes.ts";
	import { columnContributions } from "#lib/extensions/contributions.gen.ts";
	import { loadContributions } from "#lib/extensions/define.ts";

	// The list with the columns of the tenant's modules (e.g. the next maintenance), whose
	// parameters the URL may hold.
	// One `await` (`loadContributions()` awaits the modules itself): see one-await-per-derived.spec.ts.
	const columns = $derived(
		await loadContributions(columnContributions, points.list.columns, getTenantModules()),
	);
	const list = $derived(
		extendList(
			equipmentList,
			columns.flatMap(({ value }) => value ?? []),
		),
	);
	// The server filters, sorts and pages the units, as the URL says (see the orders page).
	const equipment = listQueries(() => list, getEquipmentList, getEquipmentFacets);
	const categories = getEquipmentCategories();
	// Together: the facets' query starts only when read, so awaited later it would wait for the rows.
	const [shown, facets] = $derived(await Promise.all([equipment.rows, equipment.facets]));
</script>

<svelte:head>
	<title>{m.equipment_title()}</title>
</svelte:head>

<!-- The band with the units the list leaves, and the category chips under it (in the table's
	context: they set its filter). -->
<EquipmentTable {list} equipment={shown} {facets} categories={await categories}>
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
