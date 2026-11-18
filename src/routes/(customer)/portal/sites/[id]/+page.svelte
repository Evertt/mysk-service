<!--
	One of the customer's sites the contact sees, live: what needs attention there, its open work,
	its units (each a link to its page) and a link to its maintenance report. One column, for a phone.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import { untrack } from "svelte";

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

<svelte:head>
	<title>{site.name} · {m.client_title()}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
	<a
		href={resolve("/(customer)/portal/sites")}
		class="-ml-1 flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ChevronLeftIcon class="size-4" />
		{m.customers_overview_title()}
	</a>
	<header class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold tracking-tight">{site.name}</h1>
		<p class="text-sm text-muted-foreground">{siteAddressLine(site)}</p>
	</header>

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
				class="font-medium whitespace-nowrap underline-offset-4 hover:underline"
			>
				{order.number}
			</a>
		{/snippet}
	</SiteWork>
</div>
