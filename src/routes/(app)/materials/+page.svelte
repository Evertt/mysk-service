<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import PageHeader from "#lib/components/page-header.svelte";

	import MaterialsTable from "./materials-table.svelte";
	import { getMaterials } from "./materials.remote.js";
</script>

<svelte:head>
	<title>{m.materials_title()}</title>
</svelte:head>

<PageHeader title={m.materials_title()} description={m.materials_description()}>
	{#snippet actions()}
		<Button href={resolve("/(app)/materials/new")}>
			<PlusIcon data-icon="inline-start" />
			{m.materials_new()}
		</Button>
	{/snippet}
</PageHeader>

<MaterialsTable materials={await getMaterials()} />
