<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";

	import EquipmentTable from "./equipment-table.svelte";
	import { getEquipmentList } from "./equipment.remote.js";
</script>

<svelte:head>
	<title>Equipment</title>
</svelte:head>

<PageHeader title="Equipment" description="Installed units across all customer sites.">
	{#snippet actions()}
		<Button href={resolve("/(app)/equipment/new")}>
			<PlusIcon data-icon="inline-start" />
			New unit
		</Button>
	{/snippet}
</PageHeader>

<EquipmentTable equipment={await getEquipmentList()} />
