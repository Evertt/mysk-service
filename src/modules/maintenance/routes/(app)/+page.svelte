<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import { toListQuery, whereOf } from "#lib/components/data-table/list-definition.ts";
	import { parseTableUrl } from "#lib/components/data-table/url-state.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { getDueFacets, getDuePlans } from "#modules/maintenance/list/due-list.remote.ts";
	import { dueList } from "#modules/maintenance/list/due-list.ts";
	import DueTable from "#modules/maintenance/list/due-table.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/maintenance"> } = $props();

	// The server pages, filters and sorts the plans, as the URL says (see the orders page).
	const query = $derived(
		toListQuery(dueList, parseTableUrl(page.url.searchParams, dueList.urlSpec)),
	);
	// Both start at once.
	const plans = $derived(getDuePlans(query));
	const facets = $derived(getDueFacets(whereOf(query)));
</script>

<svelte:head>
	<title>{m.maintenance_title()}</title>
</svelte:head>

<PageHeader title={m.maintenance_title()} description={m.maintenance_description()}>
	{#snippet actions()}
		<Button variant="outline" href={resolve("/(app)/(modules)/maintenance/settings")}>
			<SettingsIcon data-icon="inline-start" />
			{m.maintenance_settings()}
		</Button>
	{/snippet}
</PageHeader>

<DueTable plans={await plans} facets={await facets} />
