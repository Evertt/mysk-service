<!--
	The customer's own sites' energy in the customer portal, read-only: per site today's (or this
	month's) consumption, cost, peak and CO₂ against the previous period, the zones compared and
	what the doors let out.
-->
<script lang="ts">
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import LeafIcon from "@lucide/svelte/icons/leaf";
	import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
	import ZapIcon from "@lucide/svelte/icons/zap";

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

<svelte:head>
	<title>{m.energy_portal_label()}</title>
</svelte:head>

<div class="flex flex-col gap-6" data-client-energy>
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold">{m.energy_portal_title()}</h1>
		<p class="text-sm text-muted-foreground">{m.energy_portal_description()}</p>
	</div>

	<SegmentedNav label={m.energy_period_label()} items={periodItems} class="self-start" />

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
			<h2 class="text-lg font-semibold">{entry.site.name}</h2>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
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
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.energy_doors_title()}</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="overflow-x-auto">
							<Table.Root data-client-doors>
								<Table.Header>
									<Table.Row>
										<Table.Head>{m.energy_column_door()}</Table.Head>
										<Table.Head>{m.energy_column_status()}</Table.Head>
										<Table.Head class="text-right">{m.energy_door_loss_today()}</Table.Head>
										<Table.Head class="text-right">{m.energy_door_cost_today()}</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each entry.doors as door (door.id)}
										<Table.Row data-client-door={door.code}>
											<Table.Cell>
												<span class="font-mono text-xs text-muted-foreground">{door.code}</span>
												{door.name}
											</Table.Cell>
											<Table.Cell>
												{#if door.openedAt}
													<Badge variant={door.overdue ? "danger" : "warning"}>
														{door.overdue ? m.energy_door_overdue() : m.energy_door_open()}
													</Badge>
													<span class="text-xs text-muted-foreground">
														{formatMinutes(door.minutesOpen)}
													</span>
												{:else}
													<Badge variant="success">{m.energy_door_closed()}</Badge>
												{/if}
											</Table.Cell>
											<Table.Cell class="text-right tabular-nums">
												{formatKwh(door.lossKwhToday)}
											</Table.Cell>
											<Table.Cell class="text-right tabular-nums">
												{formatCents(costCents(door.lossKwhToday, entry.site.tariff))}
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</div>
					</Card.Content>
				</Card.Root>
			{/if}
		</section>
	{:else}
		<p class="text-sm text-muted-foreground" data-client-energy-empty>
			{m.energy_portal_none()}
		</p>
	{/each}
</div>
