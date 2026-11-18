<!--
	One of a customer's sites, live: what needs attention there, its open work, its units, and a link
	to its maintenance report.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { untrack } from "svelte";

	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { SiteWork } from "#lib/customers/components.ts";
	import { siteAddressLine } from "#lib/customers/index.ts";
	import { getCustomerSite } from "#lib/customers/remotes.ts";
	import { EquipmentLink } from "#lib/equipment/components.ts";
	import { unitTitle as titleOf } from "#lib/equipment/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	const data = $derived(await getCustomerSite({ code: params.code, id: params.id }));
	const site = $derived(data.site);
	const customerHref = $derived(resolve("/(app)/customers/[code]", { code: site.customer.code }));

	refreshOnActivity(() => getCustomerSite({ code: params.code, id: params.id }).refresh(), {
		types: untrack(() => data.watches),
	});
</script>

<PageHeader
	title={site.name}
	description={siteAddressLine(site)}
	breadcrumbs={[
		{ label: m.customers_title(), href: resolve("/(app)/customers") },
		{ label: site.customer.name, href: customerHref },
		{
			label: m.customers_overview_title(),
			href: resolve("/(app)/customers/[code]/sites", { code: site.customer.code }),
		},
		{ label: site.name },
	]}
/>

<div class="flex max-w-4xl flex-col gap-6">
	<SiteWork
		figures={data.figures}
		units={data.units}
		open={data.open}
		reportHref={resolve("/(app)/customers/[code]/sites/[id]/report", {
			code: site.customer.code,
			id: String(site.id),
		})}
	>
		{#snippet orderLink(order)}<OrderLink number={order.number} />{/snippet}
		{#snippet unitTitle(unit)}
			<EquipmentLink serialNumber={unit.serialNumber} label={titleOf(unit)} />
		{/snippet}
	</SiteWork>
</div>
