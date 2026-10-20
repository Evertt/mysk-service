<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { EquipmentLink } from "#lib/equipment/components.ts";
	import { Clock } from "#lib/hooks/clock.svelte.ts";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";
	import { formatNumber, formatPercent } from "#lib/i18n/index.ts";
	import {
		changeClass,
		formatChange,
		formatKw,
		formatKwh,
		thresholdStateDisplay,
		zoneToneDisplay,
	} from "#modules/energy/display.ts";
	import { getEnergyZone, watchEnergy } from "#modules/energy/energy.remote.ts";
	import { changePercent } from "#modules/energy/model.ts";
	import DoorCard from "#modules/energy/overview/door-card.svelte";
	import EnergyChart from "#modules/energy/overview/energy-chart.svelte";

	let { params }: { params: RouteParams<"/(app)/(modules)/energy/[site]/zones/[zone]"> } = $props();

	const args = $derived({ site: Number(params.site), zone: params.zone });
	const data = $derived(await getEnergyZone(args));
	const zone = $derived(data.zone);

	refreshOnChange(watchEnergy, () => getEnergyZone(args).refresh());
	// Open doors count up between batches.
	const clock = new Clock(15_000);
	const now = $derived(clock.now);

	const ratedTotal = $derived(data.consumers.reduce((sum, consumer) => sum + consumer.ratedKw, 0));
	/** A consumer's estimated share of the zone's consumption today: by its rated power. */
	const estimate = (ratedKw: number) => (ratedTotal > 0 ? (zone.kwh * ratedKw) / ratedTotal : 0);
	const siteHref = $derived(resolve("/(app)/(modules)/energy/[site]", { site: params.site }));
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title="{zone.code} · {zone.name}"
		description={[zone.floor, zone.areaM2 ? `${formatNumber(zone.areaM2)} m²` : null]
			.filter(Boolean)
			.join(" · ")}
		breadcrumbs={[
			{ label: m.energy_title(), href: resolve("/(app)/(modules)/energy") },
			{ label: data.site.name, href: siteHref },
			{ label: zone.code },
		]}
	>
		{#snippet actions()}
			<EnumBadge display={zoneToneDisplay} value={zone.tone} data-zone-tone={zone.tone} />
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<Card.Root size="sm" data-kpi="live">
			<Card.Header>
				<Card.Description>{m.energy_kpi_live()}</Card.Description>
				<Card.Title class="text-2xl tabular-nums">{formatKw(zone.liveKw)}</Card.Title>
			</Card.Header>
		</Card.Root>
		<Card.Root size="sm" data-kpi="consumption">
			<Card.Header>
				<Card.Description>{m.energy_kpi_today()}</Card.Description>
				<Card.Title class="text-2xl tabular-nums">{formatKwh(zone.kwh)}</Card.Title>
			</Card.Header>
			<Card.Content class="text-xs">
				{@const change = data.previousComplete ? changePercent(zone.kwh, zone.previousKwh) : null}
				<span class={changeClass(change)}>{formatChange(change)}</span>
				<span class="text-muted-foreground">{m.energy_compared_yesterday()}</span>
			</Card.Content>
		</Card.Root>
		<Card.Root size="sm" data-kpi="peak">
			<Card.Header>
				<Card.Description>{m.energy_kpi_peak()}</Card.Description>
				<Card.Title class="text-2xl tabular-nums">{formatKw(zone.peakKw)}</Card.Title>
			</Card.Header>
		</Card.Root>
		<Card.Root size="sm" data-kpi="threshold">
			<Card.Header>
				<Card.Description>{m.energy_zone_threshold()}</Card.Description>
				<Card.Title class="text-2xl tabular-nums"
					>{formatPercent(zone.ratio * 100, { basis: "percent" })}</Card.Title
				>
			</Card.Header>
			<Card.Content class="flex flex-col gap-1 text-xs">
				<EnumBadge display={thresholdStateDisplay} value={zone.state} />
				{#if zone.threshold}
					<span class="text-muted-foreground">
						{m.energy_zone_threshold_values({
							kw: formatKw(zone.threshold.maxKw),
							kwh: formatKwh(zone.threshold.maxKwh),
						})}
					</span>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<EnergyChart
		title={m.energy_chart_day_title()}
		current={zone.series}
		previous={zone.previousSeries}
		bucket="hour"
		currentLabel={m.energy_enum_period_day()}
		previousLabel={m.energy_yesterday()}
	/>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.energy_consumers_title()}</Card.Title>
			<Card.Description>{m.energy_consumers_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.consumers.length}
				<div class="overflow-x-auto">
					<Table.Root data-consumers>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.energy_column_consumer()}</Table.Head>
								<Table.Head class="text-right">{m.energy_column_rated()}</Table.Head>
								<Table.Head class="text-right">{m.energy_column_estimate()}</Table.Head>
								<Table.Head>{m.energy_column_unit()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.consumers as consumer (consumer.id)}
								<Table.Row data-consumer={consumer.name}>
									<Table.Cell class="font-medium">{consumer.name}</Table.Cell>
									<Table.Cell class="text-right tabular-nums"
										>{formatKw(consumer.ratedKw)}</Table.Cell
									>
									<Table.Cell class="text-right tabular-nums"
										>{formatKwh(estimate(consumer.ratedKw))}</Table.Cell
									>
									<Table.Cell>
										{#if consumer.serialNumber}
											<EquipmentLink
												serialNumber={consumer.serialNumber}
												class="underline-offset-4 hover:underline"
												>{consumer.unitName ?? consumer.serialNumber}</EquipmentLink
											>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.energy_consumers_none()}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if data.doors.length}
		<section class="flex flex-col gap-3" aria-labelledby="zone-doors">
			<h2 id="zone-doors" class="text-lg font-semibold">{m.energy_doors_title()}</h2>
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{#each data.doors as door (door.id)}
					<DoorCard {door} zoneName={zone.name} tariff={data.site.tariff} {now} />
				{/each}
			</div>
		</section>
	{/if}
</div>
