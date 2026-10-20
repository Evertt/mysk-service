<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import HistoryIcon from "@lucide/svelte/icons/history";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import { getTenantModules } from "#lib/auth/session.remote.ts";
	import { extendList } from "#lib/components/data-table/list-definition.ts";
	import { listQueries } from "#lib/components/data-table/server-table.svelte.ts";
	import PageBanner from "#lib/components/page-banner.svelte";
	import { columnContributions } from "#lib/extensions/contributions.gen.ts";
	import { loadContributions } from "#lib/extensions/define.ts";
	import { listColumns } from "#modules/condition/api/extensions.ts";
	import {
		getConditionCounts,
		getConditionUnits,
	} from "#modules/condition/list/units-list.remote.ts";
	import { conditionList } from "#modules/condition/list/units-list.ts";
	import UnitsTable from "#modules/condition/list/units-table.svelte";
	import FeedCard from "#modules/condition/overview/feed-card.svelte";
	import ProcessSteps from "#modules/condition/overview/process-steps.svelte";
	import StatusLegend from "#modules/condition/overview/status-legend.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/condition"> } = $props();

	// The list with the columns of the tenant's modules (checklists' inspection status), whose
	// parameters the URL may hold.
	const columns = $derived(
		await loadContributions(columnContributions, listColumns, await getTenantModules()),
	);
	const list = $derived(
		extendList(
			conditionList,
			columns.flatMap(({ value }) => value ?? []),
		),
	);
	// The server filters, sorts and pages the units, as the URL says (see the orders page).
	const units = listQueries(() => list, getConditionUnits, getConditionCounts);
	/** The chosen customer, whose service history the log shows; everyone's without one. */
	const customer = $derived.by(() => {
		const { customer } = units.query.filters;
		return customer?.length === 1 ? customer[0] : null;
	});
	let showHistory = $state(false);
</script>

<svelte:head>
	<title>{m.condition_title()}</title>
</svelte:head>

<PageBanner
	eyebrow={m.condition_banner_eyebrow()}
	title={m.condition_banner_title()}
	description={m.condition_banner_intro()}
>
	{#snippet actions()}
		<Button variant="secondary" onclick={() => (showHistory = true)}>
			<HistoryIcon data-icon="inline-start" />
			{m.condition_feed_title()}
		</Button>
		<Button variant="secondary" href={resolve("/(app)/(modules)/condition/settings")}>
			<SettingsIcon data-icon="inline-start" />
			{m.condition_settings()}
		</Button>
	{/snippet}
</PageBanner>

<ProcessSteps />

<StatusLegend thresholds={(await units.rows).thresholds} />

<UnitsTable {list} units={await units.rows} counts={await units.facets} />

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
