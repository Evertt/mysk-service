<!--
	One of the customer's sites' maintenance report, printable: the period from the URL (`from`, `to`;
	this month so far without them), the summary, its units and the faults and orders of the period.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import { untrack } from "svelte";

	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import { SiteReport } from "#lib/customers/components.ts";

	import { getPortalSiteReport } from "../../sites.remote.ts";
	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();

	/** The URL's day `name`, if it's one. */
	const day = (name: string) => {
		const value = page.url.searchParams.get(name);
		return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
	};
	const query = $derived({ id: params.id, from: day("from"), to: day("to") });
	const report = $derived(await getPortalSiteReport(query));

	refreshOnActivity(() => getPortalSiteReport(query).refresh(), {
		types: untrack(() => report.watches),
	});
</script>

<svelte:head>
	<title>{m.customers_report_title()} · {report.site.name} · {m.client_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<a
		href={resolve("/(customer)/portal/sites/[id]", { id: params.id })}
		class="-ml-1 flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
	>
		<ChevronLeftIcon class="size-4" />
		{report.site.name}
	</a>

	<SiteReport {report}>
		{#snippet orderLink(order)}
			<a
				href={resolve("/(customer)/portal/orders/[number]", { number: order.number })}
				class="font-medium whitespace-nowrap underline-offset-4 hover:underline"
			>
				{order.number}
			</a>
		{/snippet}
	</SiteReport>
</div>
