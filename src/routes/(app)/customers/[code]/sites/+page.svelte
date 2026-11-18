<!--
	A customer's sites, all in one view and live, as its head office follows them in the customer
	portal: a card per site, worst first, with what needs attention there.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { untrack } from "svelte";

	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { SitesOverview } from "#lib/customers/components.ts";
	import { getCustomerSites } from "#lib/customers/remotes.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getCustomerSites(params.code));
	const customer = $derived(data.customer);

	// Live: a fault reported, an engineer on the way or a unit's condition changing shows at once.
	refreshOnActivity(() => getCustomerSites(params.code).refresh(), {
		types: untrack(() => data.watches),
	});
</script>

<PageHeader
	title={m.customers_overview_title()}
	description={m.customers_overview_description({ name: customer.name })}
	breadcrumbs={[
		{ label: m.customers_title(), href: resolve("/(app)/customers") },
		{ label: customer.name, href: resolve("/(app)/customers/[code]", { code: customer.code }) },
		{ label: m.customers_overview_title() },
	]}
/>

<SitesOverview
	sites={data.sites}
	href={resolve("/(app)/customers/[code]/sites", { code: customer.code })}
	siteHref={(site) =>
		resolve("/(app)/customers/[code]/sites/[id]", { code: customer.code, id: String(site.id) })}
	reportHref={(site) =>
		resolve("/(app)/customers/[code]/sites/[id]/report", {
			code: customer.code,
			id: String(site.id),
		})}
/>
