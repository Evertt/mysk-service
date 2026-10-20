<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import { listQueries } from "#lib/components/data-table/server-table.svelte.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { getDueFacets, getDuePlans } from "#modules/maintenance/list/due-list.remote.ts";
	import { dueList } from "#modules/maintenance/list/due-list.ts";
	import DueTable from "#modules/maintenance/list/due-table.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/maintenance"> } = $props();

	// The server filters, sorts and pages the plans, as the URL says (see the orders page).
	const plans = listQueries(() => dueList, getDuePlans, getDueFacets);
</script>

<PageHeader title={m.maintenance_title()} description={m.maintenance_description()}>
	{#snippet actions()}
		<Button variant="outline" href={resolve("/(app)/(modules)/maintenance/settings")}>
			<SettingsIcon data-icon="inline-start" />
			{m.maintenance_settings()}
		</Button>
	{/snippet}
</PageHeader>

<DueTable plans={await plans.rows} facets={await plans.facets} />
