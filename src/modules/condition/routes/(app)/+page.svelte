<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import HistoryIcon from "@lucide/svelte/icons/history";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import { whereOf } from "#lib/components/data-table/list-definition.ts";
	import { urlListQuery } from "#lib/components/data-table/server-table.svelte.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import {
		getConditionCounts,
		getConditionUnits,
	} from "#modules/condition/list/units-list.remote.ts";
	import { conditionList } from "#modules/condition/list/units-list.ts";
	import UnitsTable from "#modules/condition/list/units-table.svelte";
	import FeedCard from "#modules/condition/overview/feed-card.svelte";
	import StatusLegend from "#modules/condition/overview/status-legend.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/condition"> } = $props();

	// The server filters, sorts and pages the units, as the URL says (see the orders page).
	const listQuery = urlListQuery(() => conditionList);
	const query = $derived(listQuery.current);
	// Both start at once.
	const units = $derived(getConditionUnits(query));
	const counts = $derived(getConditionCounts(whereOf(query)));
	/** The chosen customer, whose service history the log shows; everyone's without one. */
	const customer = $derived(
		query.filters.customer?.length === 1 ? query.filters.customer[0] : null,
	);
	let showHistory = $state(false);
</script>

<svelte:head>
	<title>{m.condition_title()}</title>
</svelte:head>

<PageHeader title={m.condition_title()} description={m.condition_description()}>
	{#snippet actions()}
		<Button variant="outline" onclick={() => (showHistory = true)}>
			<HistoryIcon data-icon="inline-start" />
			{m.condition_feed_title()}
		</Button>
		<Button variant="outline" href={resolve("/(app)/(modules)/condition/settings")}>
			<SettingsIcon data-icon="inline-start" />
			{m.condition_settings()}
		</Button>
	{/snippet}
</PageHeader>

<StatusLegend thresholds={(await units).thresholds} />

<UnitsTable units={await units} counts={await counts} />

<!-- The service history of the chosen customer's units, beside the list, so it stays in view. -->
<Sheet.Root bind:open={showHistory}>
	<Sheet.Content class="w-full overflow-y-auto sm:max-w-lg">
		<Sheet.Header class="sr-only">
			<Sheet.Title>{m.condition_feed_title()}</Sheet.Title>
		</Sheet.Header>
		{#if showHistory}
			<div class="p-4">
				<FeedCard {customer} />
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
