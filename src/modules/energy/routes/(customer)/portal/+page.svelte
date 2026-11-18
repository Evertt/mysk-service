<!--
	The customer's own sites' energy in the customer portal, read-only: per site today's (or this
	month's) consumption, cost, peak and CO₂ against the previous period, the zones compared and
	what the doors let out, one under the other, as the portal's other pages: a phone app's.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import LeafIcon from "@lucide/svelte/icons/leaf";
	import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
	import ZapIcon from "@lucide/svelte/icons/zap";

	import AppBar from "#lib/client/app-bar.svelte";
	import SegmentedNav from "#lib/components/segmented-nav.svelte";
	import { formatCents, formatNumber, formatTime } from "#lib/i18n/index.ts";
	import { getClientEnergy } from "#modules/energy/client/client-energy.remote.ts";
	import { formatCo2, formatKw, formatKwh, formatMinutes } from "#modules/energy/display.ts";
	import { energyLabels } from "#modules/energy/labels.ts";
	import { costCents, type Period, periods } from "#modules/energy/model.ts";
	import ComparisonTable from "#modules/energy/overview/comparison-table.svelte";
	import ConsumptionChart from "#modules/energy/overview/consumption-chart.svelte";
	import KpiTile from "#modules/energy/overview/kpi-tile.svelte";
	import {
		consumptionBars,
		kpisOf,
		measuredSoFar,
		readingsUntil,
		seriesOf,
	} from "#modules/energy/overview/scope.ts";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(customer)/(modules)/energy/portal"> } = $props();

	const period: Period = $derived(
		page.url.searchParams.get("period") === "month" ? "month" : "day",
	);
	const data = $derived(await getClientEnergy(period));
	const compared = $derived(
		period === "day" ? m.energy_compared_yesterday() : m.energy_compared_last_month(),
	);
	const periodItems = $derived(
		periods.map((option) => ({
			label: energyLabels.label("period", option),
			href: option === "day" ? "?" : `?period=${option}`,
			current: option === period,
		})),
	);
</script>

<AppBar
	title={m.energy_portal_title()}
	back={{ href: resolve("/(customer)/portal/more"), label: m.client_tab_more() }}
/>

<div class="flex flex-col gap-5" data-client-energy>
	<p class="px-1 text-[0.9375rem] text-muted-foreground">{m.energy_portal_description()}</p>

	<SegmentedNav label={m.energy_period_label()} items={periodItems} class="flex *:flex-1" />

	{#each data.sites as entry (entry.site.id)}
		{@const kpis = kpisOf(entry.zones, entry.doors, entry.site, entry.previousComplete)}
		{@const series = seriesOf(entry.zones)}
		{@const until = readingsUntil(entry.zones)}
		{@const measured = measuredSoFar(
			period === "day" ? "hour" : "day",
			entry.from,
			until,
			entry.site.timeZone,
		)}
		<section
			class="flex flex-col gap-4"
			aria-label={entry.site.name}
			data-client-site={entry.site.id}
		>
			<h2 class="px-1 text-[1.0625rem] font-semibold">{entry.site.name}</h2>
			<div class="grid grid-cols-2 gap-3">
				<KpiTile
					kpi="live"
					icon={ZapIcon}
					tone="text-primary"
					label={m.energy_kpi_live()}
					value={formatKw(kpis.liveKw)}
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
					tone="text-warning"
					label={m.energy_kpi_peak()}
					value={formatKw(kpis.peakKw)}
					change={kpis.peakChange}
					{compared}
				/>
				<KpiTile
					kpi="co2"
					icon={LeafIcon}
					tone="text-success"
					label={m.energy_kpi_co2()}
					value={formatCo2(kpis.co2Kg)}
				/>
				<KpiTile
					kpi="doors"
					icon={DoorOpenIcon}
					tone="text-info"
					label={m.energy_kpi_doors()}
					value={formatKwh(kpis.doorLossKwh)}
					change={kpis.doorLossChange}
					{compared}
					detail={formatCents(kpis.doorLossCents)}
				/>
			</div>

			<ConsumptionChart
				title={period === "day" ? m.energy_chart_day_title() : m.energy_chart_month_title()}
				description={period === "day"
					? m.energy_chart_day_until({ time: until ? formatTime(until) : "—" })
					: m.energy_chart_month_until({ day: formatNumber(Math.max(1, measured.index + 1)) })}
				bars={consumptionBars(series.current, series.previous, measured)}
				bucket={period === "day" ? "hour" : "day"}
				current={kpis.kwh}
				previous={kpis.previousKwh}
				change={kpis.change}
			/>

			<ComparisonTable zones={entry.zones} previousComplete={entry.previousComplete} />

			{#if entry.doors.length}
				<Card.Root class="rounded-xl">
					<Card.Header>
						<Card.Title>{m.energy_doors_title()}</Card.Title>
					</Card.Header>
					<Card.Content>
						<ul class="flex flex-col divide-y" data-client-doors>
							{#each entry.doors as door (door.id)}
								<li
									class="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
									data-client-door={door.code}
								>
									<span class="flex min-w-0 flex-col gap-1">
										<span class="truncate text-[0.9375rem] font-medium">
											<span class="font-mono text-[0.8125rem] text-muted-foreground">
												{door.code}
											</span>
											{door.name}
										</span>
										<span class="flex flex-wrap items-center gap-2">
											{#if door.openedAt}
												<Badge variant={door.overdue ? "danger" : "warning"}>
													{door.overdue ? m.energy_door_overdue() : m.energy_door_open()}
												</Badge>
												<span class="text-[0.8125rem] text-muted-foreground">
													{formatMinutes(door.minutesOpen)}
												</span>
											{:else}
												<Badge variant="success">{m.energy_door_closed()}</Badge>
											{/if}
										</span>
									</span>
									<span class="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
										<span
											class="text-[0.9375rem] font-medium"
											aria-label={m.energy_door_loss_today()}
										>
											{formatKwh(door.lossKwhToday)}
										</span>
										<span
											class="text-[0.8125rem] text-muted-foreground"
											aria-label={m.energy_door_cost_today()}
										>
											{formatCents(costCents(door.lossKwhToday, entry.site.tariff))}
										</span>
									</span>
								</li>
							{/each}
						</ul>
					</Card.Content>
				</Card.Root>
			{/if}
		</section>
	{:else}
		<p class="px-1 text-[0.9375rem] text-muted-foreground" data-client-energy-empty>
			{m.energy_portal_none()}
		</p>
	{/each}
</div>
