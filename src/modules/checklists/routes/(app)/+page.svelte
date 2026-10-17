<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";

	import { whereOf } from "#lib/components/data-table/list-definition.ts";
	import { urlListQuery } from "#lib/components/data-table/server-table.svelte.ts";
	import PageBanner from "#lib/components/page-banner.svelte";
	import { getTimeZone } from "#lib/dates.ts";
	import AssetList from "#modules/checklists/assets/asset-list.svelte";
	import { assetList } from "#modules/checklists/assets/asset-list.ts";
	import AssetPanel from "#modules/checklists/assets/asset-panel.svelte";
	import { getAssetFacets, getAssets } from "#modules/checklists/assets/assets.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/checklists"> } = $props();

	// The server searches, filters and pages the assets, as the URL says (see the orders page).
	const listQuery = urlListQuery(() => assetList);
	const query = $derived(listQuery.current);
	// Both start at once.
	const assets = $derived(getAssets(query));
	const facets = $derived(getAssetFacets(whereOf(query)));

	// What's selected (see `selection.ts`).
	const params = $derived(page.url.searchParams);
	const serialNumber = $derived(params.get("unit"));
	const componentNumber = $derived(params.get("component"));
	const checklistId = $derived(Number(params.get("checklist")) || undefined);
	const year = $derived(Temporal.Now.plainDateISO(getTimeZone()).year);
</script>

<svelte:head>
	<title>{m.checklists_module_name()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageBanner title={m.checklists_assets_title()} description={m.checklists_assets_intro()}>
		{#snippet actions()}
			<Button variant="secondary" href={resolve("/(app)/(modules)/checklists/templates")}>
				<ClipboardListIcon data-icon="inline-start" />
				{m.checklists_assets_templates()}
			</Button>
		{/snippet}
	</PageBanner>

	<div class="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
		<AssetList assets={await assets} facets={await facets} {year} />
		{#if serialNumber}
			<!-- Anew for another unit: its checklist's answers are kept in the panel as they're given. -->
			{#key serialNumber}
				<AssetPanel {serialNumber} {componentNumber} {checklistId} listQuery={query} />
			{/key}
		{:else}
			<Empty.Root class="border" data-asset-pick>
				<Empty.Header>
					<Empty.Title>{m.checklists_assets_pick_title()}</Empty.Title>
					<Empty.Description>{m.checklists_assets_pick_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</div>
</div>
