<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";

	import MaterialsTable from "./materials-table.svelte";
	import { getMaterials } from "./materials.remote.js";
</script>

<svelte:head>
	<title>Materials</title>
</svelte:head>

<PageHeader title="Materials" description="Parts and consumables, their list prices and stock.">
	{#snippet actions()}
		<Button href={resolve("/(app)/materials/new")}>
			<PlusIcon data-icon="inline-start" />
			New material
		</Button>
	{/snippet}
</PageHeader>

<MaterialsTable materials={await getMaterials()} />
