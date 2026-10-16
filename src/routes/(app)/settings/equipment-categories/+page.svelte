<!--
	@component
	The organization's equipment categories, which owners and admins keep: anyone else gets a 403
	from `getCategorySettings`.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import PageHeader from "#lib/components/page-header.svelte";
	import { CategoriesCard } from "#lib/equipment/components.ts";
	import { getCategorySettings } from "#lib/equipment/remotes.ts";

	const categories = $derived(await getCategorySettings());
</script>

<svelte:head>
	<title>{m.equipment_categories_title()} · {m.common_organization_settings()}</title>
</svelte:head>

<PageHeader
	title={m.equipment_categories_title()}
	description={m.equipment_categories_description()}
	breadcrumbs={[
		{ label: m.common_organization_settings(), href: resolve("/(app)/settings") },
		{ label: m.equipment_categories_title() },
	]}
/>

<div class="max-w-3xl">
	<CategoriesCard {categories} />
</div>
