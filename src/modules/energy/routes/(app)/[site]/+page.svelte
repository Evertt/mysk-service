<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import BellIcon from "@lucide/svelte/icons/bell";
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import LeafIcon from "@lucide/svelte/icons/leaf";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import SlidersIcon from "@lucide/svelte/icons/sliders-horizontal";
	import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
	import ZapIcon from "@lucide/svelte/icons/zap";

	import HeroBanner, { type HeroChip } from "#lib/components/hero-banner.svelte";
	import SimulationBar from "#lib/components/simulation/simulation-bar.svelte";
	import { getSimulation } from "#lib/components/simulation/simulation.remote.ts";
	import { formatCents, formatNumber, formatTime } from "#lib/i18n/index.ts";
	import { formatCo2, formatFactor, formatKw, formatKwh } from "#modules/energy/display.ts";
	import { getEnergyOverview, watchEnergy } from "#modules/energy/energy.remote.ts";
	import { type Period, periods } from "#modules/energy/model.ts";
	import AlertsList from "#modules/energy/overview/alerts-list.svelte";
	import BuildingOverview from "#modules/energy/overview/building-overview.svelte";
	import { Clock } from "#modules/energy/overview/clock.svelte.ts";
	import ComparisonTable from "#modules/energy/overview/comparison-table.svelte";
	import ConsumptionChart from "#modules/energy/overview/consumption-chart.svelte";
	import DetailPanel from "#modules/energy/overview/detail-panel.svelte";
	import DoorCard from "#modules/energy/overview/door-card.svelte";
	import KpiTile from "#modules/energy/overview/kpi-tile.svelte";
	import SavingsAdvice from "#modules/energy/overview/savings-advice.svelte";
	import {
		consumptionBars,
		doorsIn,
		floorsOf,
		installationsOf,
		kpisOf,
		measuredSoFar,
		parseScope,
		readingsUntil,
		type Scope,
		scopeParam,
		seriesOf,
		signalsOf,
		zonesIn,
	} from "#modules/energy/overview/scope.ts";
	import SignalsCard from "#modules/energy/overview/signals-card.svelte";

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
	// The demo's P1 simulation, for an organization that's offered one (else null).
	const simulation = $derived(await getSimulation("energy"));

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
	// Open doors count up between batches, the solar estimate follows the sun.
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
	const until = $derived(readingsUntil(overview.zones));
	const live = $derived(overview.zones.some((zone) => !zone.offline));
	const selectedZone = $derived(
		scope.kind === "zone" ? overview.zones.find((zone) => zone.code === scope.code) : undefined,
	);
	const scopeLabel = $derived(
		scope.kind === "zone"
			? (selectedZone?.name ?? scope.code)
			: scope.kind === "floor"
				? scope.floor
				: m.energy_scope_building(),
	);

	const bucket = $derived(period === "day" ? ("hour" as const) : ("day" as const));
	const measured = $derived(measuredSoFar(bucket, overview.from, until, site.timeZone));
	const bars = $derived(consumptionBars(series.current, series.previous, measured));
	const installations = $derived(installationsOf(zones, overview.consumers));
	const signals = $derived(signalsOf(zones, doors));

	const openDoors = $derived(doors.filter((door) => door.openedAt !== null));
	const doorLossNowKw = $derived(openDoors.reduce((total, door) => total + door.lossKw, 0));
	const doorLossTodayKwh = $derived(doors.reduce((total, door) => total + door.lossKwhToday, 0));

	const chips = $derived<HeroChip[]>([
		{ label: m.energy_hero_module(), id: "module" },
		simulation
			? simulation.running
				? {
						label: m.simulation_running({ speed: simulation.speed }),
						dot: "live",
						plain: true,
						id: "state",
					}
				: { label: m.simulation_paused(), dot: "still", plain: true, id: "state" }
			: live
				? { label: m.energy_hero_live(), dot: "live", plain: true, id: "state" }
				: { label: m.energy_hero_stale(), dot: "still", plain: true, id: "state" },
		{ label: site.name, id: "site" },
	]);

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
	const hrefOf = (next: Scope) => hrefWith({ scope: next });
	const sameScope = (a: Scope, b: Scope) => scopeParam(a) === scopeParam(b);
	const scopes = $derived<{ scope: Scope; label: string }[]>([
		{ scope: { kind: "building" }, label: m.energy_scope_building() },
		...floorsOf(overview.zones).map((floor) => ({
			scope: { kind: "floor" as const, floor },
			label: floor,
		})),
	]);
	const siteHref = $derived(resolve("/(app)/(modules)/energy/[site]", { site: params.site }));
	const zoneHref = $derived(
		selectedZone
			? resolve("/(app)/(modules)/energy/[site]/zones/[zone]", {
					site: params.site,
					zone: selectedZone.code,
				})
			: undefined,
	);
</script>

<svelte:head>
	<title>{site.name} · {m.energy_title()}</title>
</svelte:head>

<!--
	The period and the selection are this page again with other search parameters: not preloaded on
	hover (preloaded as the page arrives under a resting pointer, the charts of the preloading fork
	broke the next switch's: "Cannot convert a Symbol value to a string" in LayerChart, Svelte 5.57
	with fork preloads).
-->
<div class="flex flex-col gap-4" data-sveltekit-preload-data="tap">
	<HeroBanner
		title={m.energy_hero_title()}
		description={m.energy_hero_description()}
		{chips}
		breadcrumbs={[
			{ label: m.energy_title(), href: resolve("/(app)/(modules)/energy") },
			{ label: site.name },
		]}
	>
		{#snippet actions()}
			<Button variant="secondary" size="sm" href="{siteHref}/alerts">
				<BellIcon data-icon="inline-start" />
				{m.energy_alerts_title()}
			</Button>
			<Button variant="secondary" size="sm" href="{siteHref}/thresholds">
				<SlidersIcon data-icon="inline-start" />
				{m.energy_thresholds_title()}
			</Button>
			<Button variant="secondary" size="sm" href="{siteHref}/report">
				<PrinterIcon data-icon="inline-start" />
				{m.energy_report_title()}
			</Button>
			{#if overview.canManage}
				<Button variant="secondary" size="sm" href="{siteHref}/setup">
					<SettingsIcon data-icon="inline-start" />
					{m.energy_setup_title()}
				</Button>
			{/if}
		{/snippet}
		<p class="mt-3 text-xs text-white/75" data-site-meta>
			{m.energy_site_description({
				customer: site.customerName,
				city: site.city,
				updated: until ? formatTime(until) : "—",
			})}
		</p>
	</HeroBanner>

	<SimulationBar module="energy" label={m.energy_simulation_title()} />

	<div class="flex flex-wrap items-center gap-2">
		<nav
			class="flex flex-wrap gap-2"
			aria-label={m.energy_scope_label()}
			data-sveltekit-reset="false"
			data-scopes
		>
			{#each scopes as option (scopeParam(option.scope) ?? "building")}
				{@const current = sameScope(option.scope, scope)}
				<Button
					size="sm"
					variant={current ? "default" : "outline"}
					href={hrefWith({ scope: option.scope })}
					aria-current={current ? "page" : undefined}
					data-scope={scopeParam(option.scope) ?? "building"}
				>
					{#if option.scope.kind === "building"}<Building2Icon data-icon="inline-start" />{/if}
					{option.label}
				</Button>
			{/each}
		</nav>
		{#if scope.kind !== "building"}
			<span class="text-xs text-muted-foreground" data-selection>
				{m.energy_selection({ name: scopeLabel })}
			</span>
		{/if}
		<nav class="ml-auto flex rounded-md border bg-card p-0.5" aria-label={m.energy_period_label()}>
			{#each periods as option (option)}
				<a
					href={hrefWith({ period: option })}
					class={[
						"rounded-sm px-3 py-1 text-xs font-medium transition-colors",
						option === period
							? "bg-muted text-foreground"
							: "text-muted-foreground hover:text-foreground",
					]}
					aria-current={option === period ? "page" : undefined}
					data-sveltekit-reset="false"
					data-period={option}
					>{option === "day" ? m.energy_period_versus_day() : m.energy_period_versus_month()}</a
				>
			{/each}
		</nav>
	</div>

	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
		<KpiTile
			kpi="live"
			icon={ZapIcon}
			tone="text-primary"
			label={m.energy_kpi_live()}
			value={formatKw(kpis.liveKw)}
			detail={m.energy_kpi_zones({ count: zones.length })}
		/>
		<KpiTile
			kpi="consumption"
			icon={GaugeIcon}
			label={period === "day" ? m.energy_kpi_today() : m.energy_kpi_month()}
			value={formatKwh(kpis.kwh)}
			change={kpis.change}
			{compared}
			detail={formatCents(kpis.costCents)}
		/>
		<KpiTile
			kpi="peak"
			icon={TrendingUpIcon}
			tone="text-amber-600 dark:text-amber-400"
			label={m.energy_kpi_peak()}
			value={formatKw(kpis.peakKw)}
			change={kpis.peakChange}
			{compared}
		/>
		<KpiTile
			kpi="co2"
			icon={LeafIcon}
			tone="text-emerald-600 dark:text-emerald-400"
			label={m.energy_kpi_co2()}
			value={formatCo2(kpis.co2Kg)}
			detail={m.energy_kpi_co2_factor({ factor: formatFactor(site.co2Factor) })}
		/>
		<KpiTile
			kpi="alerts"
			icon={CircleAlertIcon}
			tone={kpis.activeAlerts
				? "text-rose-600 dark:text-rose-400"
				: "text-emerald-600 dark:text-emerald-400"}
			label={m.energy_kpi_alerts()}
			value={formatNumber(kpis.activeAlerts)}
			detail={m.energy_kpi_alerts_open({ count: overview.openAlerts })}
		/>
		<KpiTile
			kpi="doors"
			icon={DoorOpenIcon}
			tone="text-sky-600 dark:text-sky-400"
			label={m.energy_kpi_doors()}
			value={formatKwh(kpis.doorLossKwh)}
			change={kpis.doorLossChange}
			{compared}
			detail={formatCents(kpis.doorLossCents)}
		/>
	</div>

	<BuildingOverview {site} zones={overview.zones} {scope} {hrefOf} {now} />

	{#if doors.length}
		<Card.Root data-door-watch>
			<Card.Header>
				<div class="flex items-center gap-2">
					<span
						class="grid size-9 shrink-0 place-items-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-400"
					>
						<DoorOpenIcon class="size-4" aria-hidden="true" />
					</span>
					<div class="flex flex-col gap-0.5">
						<Card.Title>{m.energy_doors_heading()}</Card.Title>
						<Card.Description>{m.energy_doors_description()}</Card.Description>
					</div>
				</div>
				<Card.Action class="flex flex-wrap justify-end gap-1.5">
					<Badge variant={openDoors.length ? "warning" : "success"} data-doors-open
						>{m.energy_doors_open_count({ count: openDoors.length })}</Badge
					>
					<Badge variant="info">{m.energy_doors_loss_now({ kw: formatKw(doorLossNowKw) })}</Badge>
					<Badge variant="neutral"
						>{m.energy_doors_today({
							kwh: formatKwh(doorLossTodayKwh),
							cost: formatCents(Math.round(doorLossTodayKwh * site.tariff * 100)),
						})}</Badge
					>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					{#each doors as door (door.id)}
						<DoorCard {door} zoneName={zoneName(door.zoneId)} tariff={site.tariff} {now} />
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

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

	<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
		<ConsumptionChart
			title="{period === 'day'
				? m.energy_chart_day_title()
				: m.energy_chart_month_title()} · {scopeLabel}"
			description={period === "day"
				? m.energy_chart_day_until({ time: until ? formatTime(until) : "—" })
				: m.energy_chart_month_until({ day: formatNumber(Math.max(1, measured.index + 1)) })}
			{bars}
			{bucket}
			current={kpis.kwh}
			previous={kpis.previousKwh}
			change={kpis.change}
		/>
		<DetailPanel
			{scopeLabel}
			liveKw={kpis.liveKw}
			peakKw={kpis.peakKw}
			kwh={kpis.kwh}
			zones={zones.length}
			{installations}
			{zoneHref}
		/>
	</div>

	<ComparisonTable
		{zones}
		previousComplete={overview.previousComplete}
		{hrefOf}
		selected={selectedZone?.code}
	/>

	<div class="grid gap-4 lg:grid-cols-2">
		<SignalsCard {signals} />
		<SavingsAdvice {kpis} {period} />
	</div>
</div>
