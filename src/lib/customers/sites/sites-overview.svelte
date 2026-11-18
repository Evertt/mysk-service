<!--
	@component
	The sites overview, in the office (a customer's sites) and in the customer portal (the sites its
	contact sees): a card per site (`SiteOverviewCard`), worst first as the server sorts them, and a
	choice of all sites or only those needing attention, kept in the URL (`?show=attention`) so back
	and a reload keep it. `href` is the overview's own page; `siteHref` and `reportHref` a site's page
	and report in the shell. `layout="stack"` is one column (the portal, made for a phone), `"grid"`
	(the default) as many as fit.
-->
<script lang="ts">
	import { page } from "$app/state";
	import MapPinnedIcon from "@lucide/svelte/icons/map-pinned";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import type { ComponentProps } from "svelte";

	import FilterChips from "#lib/components/filter-chips.svelte";

	import { needsAttention } from "./figures.ts";
	import SiteOverviewCard from "./site-overview-card.svelte";

	type Site = ComponentProps<typeof SiteOverviewCard>["site"];

	let {
		sites,
		href,
		siteHref,
		reportHref,
		layout = "grid",
	}: {
		sites: readonly Site[];
		href: string;
		siteHref: (site: Site) => string;
		reportHref: (site: Site) => string;
		layout?: "grid" | "stack";
	} = $props();

	const attentionOnly = $derived(page.url.searchParams.get("show") === "attention");
	const needing = $derived(sites.filter((site) => needsAttention(site.figures)));
	const shown = $derived(attentionOnly ? needing : sites);
</script>

<div class="flex flex-col gap-4" data-sites-overview>
	<FilterChips
		label={m.customers_overview_filter_label()}
		options={[
			{
				value: "attention",
				label: m.customers_overview_filter_attention(),
				count: needing.length,
				href: `${href}?show=attention`,
			},
		]}
		value={attentionOnly ? "attention" : null}
		all={{ label: m.customers_overview_filter_all(), count: sites.length, href }}
		data-sveltekit-replacestate
		data-sveltekit-noscroll
	/>

	{#if shown.length}
		<div class={["grid items-start gap-4", layout === "grid" && "sm:grid-cols-2 xl:grid-cols-3"]}>
			{#each shown as site (site.id)}
				<SiteOverviewCard {site} href={siteHref(site)} reportHref={reportHref(site)} />
			{/each}
		</div>
	{:else}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon">
					{#if attentionOnly}<ShieldCheckIcon />{:else}<MapPinnedIcon />{/if}
				</Empty.Media>
				<Empty.Title>
					{attentionOnly ? m.customers_overview_all_clear() : m.customers_overview_empty()}
				</Empty.Title>
			</Empty.Header>
		</Empty.Root>
	{/if}
</div>
