<!--
	All the customer's sites the contact sees, in one view and live, for a head office that follows
	them all: a card per site, worst first, with what needs attention there. One column, for a phone.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { untrack } from "svelte";

	import AppBar from "#lib/client/app-bar.svelte";
	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import { SitesOverview } from "#lib/customers/components.ts";

	import { getPortalSiteOverview } from "./sites.remote.ts";

	const data = $derived(await getPortalSiteOverview());

	// Live: a fault reported, an engineer on the way or a unit's condition changing shows at once.
	refreshOnActivity(() => getPortalSiteOverview().refresh(), {
		types: untrack(() => data.watches),
	});
</script>

<AppBar
	title={m.customers_overview_title()}
	subtitle={m.customers_overview_portal_description()}
	back={{ href: resolve("/(customer)/portal"), label: m.client_nav_home() }}
/>

<SitesOverview
	layout="stack"
	sites={data.sites}
	href={resolve("/(customer)/portal/sites")}
	siteHref={(site) => resolve("/(customer)/portal/sites/[id]", { id: String(site.id) })}
	reportHref={(site) => resolve("/(customer)/portal/sites/[id]/report", { id: String(site.id) })}
/>
