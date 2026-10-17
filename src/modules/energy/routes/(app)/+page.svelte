<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import PageHeader from "#lib/components/page-header.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";
	import { formatKw, formatKwh } from "#modules/energy/display.ts";
	import { getEnergySites } from "#modules/energy/energy.remote.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(app)/(modules)/energy"> } = $props();

	const data = $derived(await getEnergySites());
	const sites = $derived(data.sites);
</script>

<svelte:head>
	<title>{m.energy_title()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader title={m.energy_title()} description={m.energy_description()}>
		{#snippet actions()}
			{#if data.canManage}
				<Button variant="outline" href={resolve("/(app)/(modules)/energy/settings")}>
					<SettingsIcon data-icon="inline-start" />
					{m.energy_settings_title()}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if sites.length}
		<ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each sites as site (site.id)}
				<li>
					<a
						href={resolve("/(app)/(modules)/energy/[site]", { site: String(site.id) })}
						class="block h-full"
						data-energy-site={site.id}
					>
						<Card.Root class="h-full transition-colors hover:bg-muted/40">
							<Card.Header>
								<Card.Title>{site.name}</Card.Title>
								<Card.Description>{site.customerName} · {site.city}</Card.Description>
								{#if site.openAlerts}
									<Card.Action>
										<Badge variant="danger">
											{m.energy_kpi_alerts_open({ count: site.openAlerts })}
										</Badge>
									</Card.Action>
								{/if}
							</Card.Header>
							<Card.Content>
								<dl class="grid grid-cols-2 gap-3 text-sm">
									<div>
										<dt class="text-xs text-muted-foreground">{m.energy_kpi_live()}</dt>
										<dd class="text-lg font-semibold tabular-nums">{formatKw(site.liveKw)}</dd>
									</div>
									<div>
										<dt class="text-xs text-muted-foreground">{m.energy_kpi_today()}</dt>
										<dd class="text-lg font-semibold tabular-nums">{formatKwh(site.kwhToday)}</dd>
									</div>
									<div class="col-span-2 text-xs text-muted-foreground">
										{m.energy_site_counts({
											zones: formatNumber(site.zones),
											doors: formatNumber(site.doors),
										})}
									</div>
								</dl>
							</Card.Content>
						</Card.Root>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<Card.Root>
			<Card.Content>
				<p class="text-sm text-muted-foreground">{m.energy_no_sites()}</p>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
