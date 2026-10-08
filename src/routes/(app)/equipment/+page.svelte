<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";

	import EquipmentTable from "./equipment-table.svelte";
	import { getEquipmentList } from "./equipment.remote.js";
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

<EquipmentTable equipment={await getEquipmentList()} />
