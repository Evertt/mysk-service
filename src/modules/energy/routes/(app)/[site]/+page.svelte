<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import BellIcon from "@lucide/svelte/icons/bell";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import SlidersIcon from "@lucide/svelte/icons/sliders-horizontal";

	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents, formatNumber, formatTime } from "#lib/i18n/index.ts";
	import { formatCo2, formatFactor, formatKw, formatKwh } from "#modules/energy/display.ts";
	import { getEnergyOverview, watchEnergy } from "#modules/energy/energy.remote.ts";
	import { energyLabels } from "#modules/energy/labels.ts";
	import { type Period, periods } from "#modules/energy/model.ts";
	import AlertsList from "#modules/energy/overview/alerts-list.svelte";
	import BuildingOverview from "#modules/energy/overview/building-overview.svelte";
	import { Clock } from "#modules/energy/overview/clock.svelte.ts";
	import ComparisonTable from "#modules/energy/overview/comparison-table.svelte";
	import DoorCard from "#modules/energy/overview/door-card.svelte";
	import EnergyChart from "#modules/energy/overview/energy-chart.svelte";
	import KpiTile from "#modules/energy/overview/kpi-tile.svelte";
	import SavingsAdvice from "#modules/energy/overview/savings-advice.svelte";
	import {
		doorsIn,
		floorsOf,
		kpisOf,
		parseScope,
		type Scope,
		scopeParam,
		seriesOf,
		zonesIn,
	} from "#modules/energy/overview/scope.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/energy/[site]"> } = $props();

	const siteId = $derived(Number(params.site));
	const period: Period = $derived(
		(periods as readonly string[]).includes(page.url.searchParams.get("period") ?? "")
			? (page.url.searchParams.get("period") as Period)
			: "day",
	);
	const scope = $derived(parseScope(page.url.searchParams.get("scope")));
	const overview = $derived(await getEnergyOverview({ site: siteId, period }));
	const site = $derived(overview.site);

	// Live: a batch from the gateway, an alert dealt with or a threshold changed asks again.
	const changes = watchEnergy();
	let seen: number | undefined;
	$effect(() => {
		const changed = changes.current;
		if (changed === undefined) return;
		if (seen !== undefined && changed !== seen) {
			void getEnergyOverview({ site: siteId, period }).refresh();
		}
		seen = changed;
	});
	// Open doors count up between batches.
	const clock = new Clock();
	const now = $derived(clock.now);

	const zones = $derived(zonesIn(overview.zones, scope));
	const doors = $derived(doorsIn(overview.doors, zones));
	const kpis = $derived(kpisOf(zones, doors, site, overview.previousComplete));
	const series = $derived(seriesOf(zones));
	const zoneName = (id: number) => overview.zones.find((zone) => zone.id === id)?.name ?? "";
	const compared = $derived(
		period === "day" ? m.energy_compared_yesterday() : m.energy_compared_last_month(),
	);
	const latest = $derived(
		overview.zones
			.flatMap((zone) => (zone.latestAt ? [zone.latestAt] : []))
			.toSorted((a, b) => Temporal.Instant.compare(a, b))
			.at(-1),
	);

	/** The page with another period or scope, keeping the other. */
	function hrefWith(change: { period?: Period; scope?: Scope }) {
		const search = new URLSearchParams();
		const nextPeriod = change.period ?? period;
		const nextScope = scopeParam(change.scope ?? scope);
		if (nextPeriod !== "day") search.set("period", nextPeriod);
		if (nextScope) search.set("scope", nextScope);
		const query = search.toString();
		return `${resolve("/(app)/(modules)/energy/[site]", { site: params.site })}${query ? `?${query}` : ""}`;
	}
	const sameScope = (a: Scope, b: Scope) => scopeParam(a) === scopeParam(b);
	const chips = $derived<{ scope: Scope; label: string }[]>([
		{ scope: { kind: "building" }, label: m.energy_scope_building() },
		...floorsOf(overview.zones).map((floor) => ({
			scope: { kind: "floor" as const, floor },
			label: floor,
		})),
		...overview.zones.map((zone) => ({
			scope: { kind: "zone" as const, code: zone.code },
			label: zone.code,
		})),
	]);
	const siteHref = $derived(resolve("/(app)/(modules)/energy/[site]", { site: params.site }));
</script>

<svelte:head>
	<title>{site.name} · {m.energy_title()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader
		title={site.name}
		description={m.energy_site_description({
			customer: site.customerName,
			city: site.city,
			updated: latest ? formatTime(latest.add({ minutes: 15 })) : "—",
		})}
		breadcrumbs={[
			{ label: m.energy_title(), href: resolve("/(app)/(modules)/energy") },
			{ label: site.name },
		]}
	>
		{#snippet actions()}
			<Button variant="outline" href="{siteHref}/alerts">
				<BellIcon data-icon="inline-start" />
				{m.energy_alerts_title()}
			</Button>
			<Button variant="outline" href="{siteHref}/thresholds">
				<SlidersIcon data-icon="inline-start" />
				{m.energy_thresholds_title()}
			</Button>
			<Button variant="outline" href="{siteHref}/report">
				<FileTextIcon data-icon="inline-start" />
				{m.energy_report_title()}
			</Button>
			{#if overview.canManage}
				<Button variant="outline" href="{siteHref}/setup">
					<SettingsIcon data-icon="inline-start" />
					{m.energy_setup_title()}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<!--
		The period and the scope are this page again with other search parameters: not preloaded on
		hover (preloaded as the page arrives under a resting pointer, the charts of the preloading fork
		broke the next switch's: "Cannot convert a Symbol value to a string" in LayerChart, Svelte
		5.57 with fork preloads).
	-->
	<div class="flex flex-col gap-3" data-sveltekit-preload-data="tap">
		<nav class="flex flex-wrap gap-2" aria-label={m.energy_period_label()}>
			{#each periods as option (option)}
				<Button
					size="sm"
					variant={option === period ? "default" : "outline"}
					href={hrefWith({ period: option })}
					aria-current={option === period ? "page" : undefined}
					data-period={option}>{energyLabels.label("period", option)}</Button
				>
			{/each}
		</nav>
		<nav class="flex flex-wrap gap-1.5" aria-label={m.energy_scope_label()} data-scopes>
			{#each chips as chip (scopeParam(chip.scope) ?? "building")}
				{@const current = sameScope(chip.scope, scope)}
				<a
					href={hrefWith({ scope: chip.scope })}
					class={[
						"rounded-full border px-3 py-1 text-xs transition-colors",
						current
							? "border-primary bg-primary text-primary-foreground"
							: "text-muted-foreground hover:bg-muted",
					]}
					aria-current={current ? "page" : undefined}
					data-scope={scopeParam(chip.scope) ?? "building"}>{chip.label}</a
				>
			{/each}
		</nav>
	</div>

	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
		<KpiTile
			kpi="live"
			label={m.energy_kpi_live()}
			value={formatKw(kpis.liveKw)}
			detail={m.energy_kpi_zones({ count: zones.length })}
		/>
		<KpiTile
			kpi="consumption"
			label={period === "day" ? m.energy_kpi_today() : m.energy_kpi_month()}
			value={formatKwh(kpis.kwh)}
			change={kpis.change}
			{compared}
			detail={formatCents(kpis.costCents)}
		/>
		<KpiTile
			kpi="peak"
			label={m.energy_kpi_peak()}
			value={formatKw(kpis.peakKw)}
			change={kpis.peakChange}
			{compared}
		/>
		<KpiTile
			kpi="co2"
			label={m.energy_kpi_co2()}
			value={formatCo2(kpis.co2Kg)}
			detail={m.energy_kpi_co2_factor({ factor: formatFactor(site.co2Factor) })}
		/>
		<KpiTile
			kpi="alerts"
			label={m.energy_kpi_alerts()}
			value={formatNumber(kpis.activeAlerts)}
			detail={m.energy_kpi_alerts_open({ count: overview.openAlerts })}
		/>
		<KpiTile
			kpi="doors"
			label={m.energy_kpi_doors()}
			value={formatKwh(kpis.doorLossKwh)}
			change={kpis.doorLossChange}
			{compared}
			detail={formatCents(kpis.doorLossCents)}
		/>
	</div>

	<EnergyChart
		title={period === "day" ? m.energy_chart_day_title() : m.energy_chart_month_title()}
		current={series.current}
		previous={series.previous}
		bucket={period === "day" ? "hour" : "day"}
		currentLabel={energyLabels.label("period", period)}
		previousLabel={period === "day" ? m.energy_yesterday() : m.energy_last_month()}
	/>

	<BuildingOverview {site} {zones} {period} />

	{#if doors.length}
		<section class="flex flex-col gap-3" aria-labelledby="door-watch">
			<h2 id="door-watch" class="text-lg font-semibold">{m.energy_doors_title()}</h2>
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{#each doors as door (door.id)}
					<DoorCard {door} zoneName={zoneName(door.zoneId)} tariff={site.tariff} {now} />
				{/each}
			</div>
		</section>
	{/if}

	<div class="grid gap-4 lg:grid-cols-[1fr_22rem]">
		<ComparisonTable {zones} previousComplete={overview.previousComplete} />
		<SavingsAdvice {kpis} {period} />
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.energy_alerts_open_title()}</Card.Title>
			<Card.Action>
				<Button variant="outline" size="sm" href="{siteHref}/alerts">{m.energy_alerts_all()}</Button
				>
			</Card.Action>
		</Card.Header>
		<Card.Content>
			<AlertsList site={siteId} status="open" />
		</Card.Content>
	</Card.Root>
</div>
