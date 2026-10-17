<!--
	@component
	The building by floor: each zone's live power, its consumption over the period and its tone
	(nominaal, verhoogd, piekbelasting, offline), linking to the zone's page; zones without a floor
	(an external unit) after the floors. Beside it, the main meter: the site's live power against its
	contracted peak, the period's consumption against the contract's pace, and the solar panels.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatNumber } from "#lib/i18n/index.ts";

	import { formatKw, formatKwh, toneBadges, toneColours } from "../display.ts";
	import { energyLabels } from "../labels.ts";
	import type { Period } from "../model.ts";
	import type { EnergySite, ZoneFigures } from "../server/figures.ts";
	import { floorsOf, kpisOf } from "./scope.ts";

	let { site, zones, period }: { site: EnergySite; zones: ZoneFigures[]; period: Period } =
		$props();

	const groups = $derived([
		...floorsOf(zones).map((floor) => ({
			floor,
			zones: zones.filter((zone) => zone.floor === floor),
		})),
		...(zones.some((zone) => !zone.floor)
			? [{ floor: m.energy_no_floor(), zones: zones.filter((zone) => !zone.floor) }]
			: []),
	]);

	const totals = $derived(kpisOf(zones, [], site));
	const peakShare = $derived(
		site.contractedPeakKw > 0 ? (totals.liveKw / site.contractedPeakKw) * 100 : 0,
	);
	/** The contract's kWh for the period: a day's or this month's share of the year's. */
	const contractKwh = $derived(
		(site.contractedKwhPerYear / 365) * (period === "day" ? 1 : (zones[0]?.series.length ?? 30)),
	);
	const zoneHref = (code: string) =>
		resolve("/(app)/(modules)/energy/[site]/zones/[zone]", { site: String(site.id), zone: code });
</script>

<div class="grid gap-4 lg:grid-cols-[1fr_18rem]">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.energy_building_title()}</Card.Title>
			<Card.Description>{m.energy_building_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-5">
			{#each groups as group (group.floor)}
				<section class="flex flex-col gap-2" aria-label={group.floor} data-floor={group.floor}>
					<h3 class="text-sm font-medium text-muted-foreground">{group.floor}</h3>
					<ul class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
						{#each group.zones as zone (zone.id)}
							<li>
								<a
									href={zoneHref(zone.code)}
									class="flex h-full flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50"
									data-zone={zone.code}
									data-tone={zone.tone}
								>
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<p class="font-mono text-xs text-muted-foreground">{zone.code}</p>
											<p class="truncate font-medium">{zone.name}</p>
										</div>
										<Badge variant={toneBadges[zone.tone]}>
											{energyLabels.label("zoneTone", zone.tone)}
										</Badge>
									</div>
									<div class="flex items-end justify-between gap-2 tabular-nums">
										<span class="text-lg font-semibold" data-live-kw>{formatKw(zone.liveKw)}</span>
										<span class="text-sm text-muted-foreground">{formatKwh(zone.kwh)}</span>
									</div>
									<span
										class={["h-1 rounded-full", toneColours[zone.tone]]}
										style:width="{Math.min(100, Math.round(zone.ratio * 100))}%"
										aria-hidden="true"
									></span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root data-main-meter>
		<Card.Header>
			<Card.Title>{site.meterName}</Card.Title>
			<Card.Description>{m.energy_meter_description()}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4 text-sm">
			<div class="flex flex-col gap-1">
				<div class="flex justify-between gap-2">
					<span class="text-muted-foreground">{m.energy_meter_live()}</span>
					<span class="font-medium tabular-nums">{formatKw(totals.liveKw)}</span>
				</div>
				<div
					class="h-2 overflow-hidden rounded-full bg-muted"
					role="meter"
					aria-label={m.energy_meter_peak_share()}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(peakShare)}
				>
					<div
						class={["h-full rounded-full", peakShare >= 100 ? "bg-rose-600" : "bg-primary"]}
						style:width="{Math.min(100, peakShare)}%"
					></div>
				</div>
				<span class="text-xs text-muted-foreground">
					{m.energy_meter_contract_peak({
						share: formatNumber(Math.round(peakShare)),
						kw: formatKw(site.contractedPeakKw),
					})}
				</span>
			</div>
			<div class="flex flex-col gap-1">
				<div class="flex justify-between gap-2">
					<span class="text-muted-foreground">{energyLabels.label("period", period)}</span>
					<span class="font-medium tabular-nums">{formatKwh(totals.kwh)}</span>
				</div>
				<span class="text-xs text-muted-foreground">
					{m.energy_meter_contract_kwh({
						kwh: formatKwh(contractKwh),
						year: formatKwh(site.contractedKwhPerYear),
					})}
				</span>
			</div>
			<div class="flex justify-between gap-2">
				<span class="text-muted-foreground">{m.energy_meter_pv()}</span>
				<span class="font-medium tabular-nums">{formatKw(site.pvCapacityKw)}</span>
			</div>
		</Card.Content>
	</Card.Root>
</div>
