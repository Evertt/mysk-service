<!--
	One of a customer's sites' maintenance report, printable: the period from the URL (`from`, `to`;
	this month so far without them), the summary, its units and the faults and orders of the period.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { untrack } from "svelte";

	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { SiteReport } from "#lib/customers/components.ts";
	import { getCustomerSiteReport } from "#lib/customers/remotes.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	/** The URL's day `name`, if it's one. */
	const day = (name: string) => {
		const value = page.url.searchParams.get(name);
		return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
	};
	const query = $derived({ code: params.code, id: params.id, from: day("from"), to: day("to") });
	const report = $derived(await getCustomerSiteReport(query));
	const site = $derived(report.site);

	refreshOnActivity(() => getCustomerSiteReport(query).refresh(), {
		types: untrack(() => report.watches),
	});
</script>

<div class="print:hidden">
	<PageHeader
		title={m.customers_report_title()}
		description={site.name}
		breadcrumbs={[
			{ label: m.customers_title(), href: resolve("/(app)/customers") },
			{
				label: site.customer.name,
				href: resolve("/(app)/customers/[code]", { code: site.customer.code }),
			},
			{
				label: site.name,
				href: resolve("/(app)/customers/[code]/sites/[id]", {
					code: site.customer.code,
					id: String(site.id),
				}),
			},
			{ label: m.customers_report_title() },
		]}
	/>
</div>

<SiteReport {report}>
	{#snippet orderLink(order)}<OrderLink number={order.number} preview={false} />{/snippet}
</SiteReport>
