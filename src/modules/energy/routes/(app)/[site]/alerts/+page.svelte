<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";

	import PageHeader from "#lib/components/page-header.svelte";
	import { getEnergySite } from "#modules/energy/energy.remote.ts";
	import { energyLabels } from "#modules/energy/labels.ts";
	import { type AlertStatus, alertStatuses } from "#modules/energy/model.ts";
	import AlertsList from "#modules/energy/overview/alerts-list.svelte";

	let { params }: { params: RouteParams<"/(app)/(modules)/energy/[site]/alerts"> } = $props();

	const siteId = $derived(Number(params.site));
	const status = $derived.by((): AlertStatus | null => {
		const value = page.url.searchParams.get("status");
		return (alertStatuses as readonly string[]).includes(value ?? "")
			? (value as AlertStatus)
			: null;
	});
	const site = $derived(await getEnergySite(siteId));

	const here = $derived(resolve("/(app)/(modules)/energy/[site]/alerts", { site: params.site }));
	const siteHref = $derived(resolve("/(app)/(modules)/energy/[site]", { site: params.site }));
</script>

<svelte:head>
	<title>{m.energy_alerts_title()} · {site.name}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader
		title={m.energy_alerts_title()}
		description={m.energy_alerts_description()}
		breadcrumbs={[
			{ label: m.energy_title(), href: resolve("/(app)/(modules)/energy") },
			{ label: site.name, href: siteHref },
			{ label: m.energy_alerts_title() },
		]}
	/>

	<nav class="flex flex-wrap gap-2" aria-label={m.energy_alert_status_label()}>
		<Button size="sm" variant={status === null ? "default" : "outline"} href={here}>
			{m.energy_alerts_all()}
		</Button>
		{#each alertStatuses as option (option)}
			<Button
				size="sm"
				variant={status === option ? "default" : "outline"}
				href="{here}?status={option}"
				data-status-filter={option}>{energyLabels.label("alertStatus", option)}</Button
			>
		{/each}
	</nav>

	<Card.Root>
		<Card.Content>
			<AlertsList site={siteId} {status} />
		</Card.Content>
	</Card.Root>
</div>
