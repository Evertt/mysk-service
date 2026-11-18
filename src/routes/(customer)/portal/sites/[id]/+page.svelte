<!--
	One of the customer's sites the contact sees, live: what needs attention there, its open work,
	its units (each a link to its page) and a link to its maintenance report. One column, for a phone.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { untrack } from "svelte";

	import AppBar from "#lib/client/app-bar.svelte";
	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import { SiteWork } from "#lib/customers/components.ts";
	import { siteAddressLine } from "#lib/customers/index.ts";

	import { getPortalSite } from "../sites.remote.ts";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getPortalSite(params.id));
	const site = $derived(data.site);

	refreshOnActivity(() => getPortalSite(params.id).refresh(), {
		types: untrack(() => data.watches),
	});
</script>

<AppBar
	title={site.name}
	subtitle={siteAddressLine(site)}
	back={{ href: resolve("/(customer)/portal/sites"), label: m.customers_overview_title() }}
/>

<SiteWork
	figures={data.figures}
	units={data.units}
	open={data.open}
	reportHref={resolve("/(customer)/portal/sites/[id]/report", { id: String(site.id) })}
	unitHref={(unit) =>
		resolve("/(customer)/portal/equipment/[serial]", { serial: unit.serialNumber })}
>
	{#snippet orderLink(order)}
		<a
			href={resolve("/(customer)/portal/orders/[number]", { number: order.number })}
			class="inline-flex min-h-11 items-center font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline"
		>
			{order.number}
		</a>
	{/snippet}
</SiteWork>
