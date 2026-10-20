<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import { urlListQuery } from "#lib/components/data-table/server-table.svelte.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { partnersList } from "#modules/partner-programme/list/partners-list.ts";
	import PartnersTable from "#modules/partner-programme/list/partners-table.svelte";
	import { getPartners, getPartnersYear } from "#modules/partner-programme/list/partners.remote.ts";
	import { getProgrammeOverview } from "#modules/partner-programme/overview.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/partner-programme"> } = $props();

	// The server filters, sorts and pages the partners, as the URL says (see the orders page).
	const listQuery = urlListQuery(() => partnersList);
	const query = $derived(listQuery.current);
	// They start at once.
	const partners = $derived(getPartners(query));
	const year = $derived(getPartnersYear());
	const overview = $derived(getProgrammeOverview());
</script>

<svelte:head>
	<title>{m.partners_title()}</title>
</svelte:head>

<PageHeader
	title={m.partners_title()}
	description={m.partners_description({ year: String((await year).year) })}
>
	{#snippet actions()}
		<Button variant="outline" href={resolve("/(app)/(modules)/partner-programme/settings")}>
			<SettingsIcon data-icon="inline-start" />
			{m.partners_years_title()}
		</Button>
	{/snippet}
</PageHeader>

<PartnersTable partners={await partners} levels={(await year).levels} overview={await overview} />
