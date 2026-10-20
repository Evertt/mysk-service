<!--
	@component
	The building as a floor plan ("Gebouwoverzicht"), after the mockup: the floors stacked, the top
	one first, each zone a block bordered in its tone (nominaal, verhoogd, piekbelasting, offline)
	with a dot that pulses with its load, its live power and its consumption over the period; zones
	without a floor (an external unit) outside the building. A floor's label and a zone select them
	on the site's page (`hrefOf`), the selection ringed. Beside it the live P1 meter: the site's
	power against its contracted peak, its bar flowing with the load, the contract and the solar
	panels' estimated generation now.
-->
<script lang="ts">
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import ZapIcon from "@lucide/svelte/icons/zap";

	import { formatNumber } from "#lib/i18n/index.ts";

	import { formatKw, formatKwh, toneColours, toneBorders } from "../display.ts";
	import { energyLabels } from "../labels.ts";
	import { floorsTopDown, solarEstimateKw, type ZoneTone } from "../model.ts";
	import type { EnergySite, ZoneFigures } from "../server/figures.ts";
	import { floorsOf, type Scope, scopeParam } from "./scope.ts";

	let {
		site,
		zones,
		scope,
		hrefOf,
		now,
	}: {
		site: EnergySite;
		/** All the site's zones: the plan shows the building whatever is selected. */
		zones: ZoneFigures[];
		scope: Scope;
		/** The site's page with another selection. */
		hrefOf: (scope: Scope) => string;
		now: Temporal.Instant;
	} = $props();

	const floors = $derived(
		floorsTopDown(floorsOf(zones)).map((floor) => ({
			floor,
			zones: zones.filter((zone) => zone.floor === floor),
		})),
	);
	const outside = $derived(zones.filter((zone) => !zone.floor));
	const tones: ZoneTone[] = ["nominal", "elevated", "peak", "offline"];

	const totalKw = $derived(zones.reduce((total, zone) => total + zone.liveKw, 0));
	const peakShare = $derived(
		site.contractedPeakKw > 0 ? (totalKw / site.contractedPeakKw) * 100 : 0,
	);
	const solarKw = $derived(
		solarEstimateKw(site.pvCapacityKw, now.toZonedDateTimeISO(site.timeZone)),
	);
	/** The meter's bar flows faster the closer the load is to the contracted peak. */
	const flowSeconds = $derived(Math.max(0.8, 4 - (peakShare / 100) * 3));

	/**
	 * A zone's columns of a floor's six: up to three a row; a last row of one spans the floor (the
	 * mockup's Expeditie & Docks), of two half of it each.
	 */
	function spanOf(index: number, count: number) {
		if (count <= 3) return 6 / count;
		const rest = count % 3;
		const lastRow = index >= count - rest;
		if (!lastRow || rest === 0) return 2;
		return rest === 1 ? 6 : 3;
	}
	const spans: Record<number, string> = {
		2: "sm:col-span-2",
		3: "sm:col-span-3",
		6: "sm:col-span-6",
	};

	const selected = (candidate: Scope) => scopeParam(candidate) === scopeParam(scope);
	/** How fast a zone's dot pulses: the higher its load, the faster. */
	const pulseOf = (tone: ZoneTone) =>
		tone === "peak" ? "0.9s" : tone === "elevated" ? "1.6s" : "2.6s";
</script>

{#snippet zoneBlock(zone: ZoneFigures, span: number)}
	{@const current = selected({ kind: "zone", code: zone.code })}
	<a
		href={hrefOf({ kind: "zone", code: zone.code })}
		class={[
			"flex min-w-0 flex-col rounded-md border-2 bg-card p-2 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
			toneBorders[zone.tone],
			zone.floor === null && "border-dashed",
			current && "ring-2 ring-primary ring-offset-2 ring-offset-background",
			spans[span],
		]}
		title="{zone.code} · {energyLabels.label('zoneTone', zone.tone)}"
		aria-current={current ? "true" : undefined}
		data-sveltekit-reset="false"
		data-zone={zone.code}
		data-tone={zone.tone}
	>
		<span class="flex items-center gap-1.5">
			<span class="relative flex size-2 shrink-0" aria-hidden="true">
				{#if zone.tone === "peak"}
					<span class={["halo absolute inline-flex size-full rounded-full", toneColours.peak]}
					></span>
				{/if}
				<span
					class={["pulse relative inline-flex size-2 rounded-full", toneColours[zone.tone]]}
					style:--pulse={pulseOf(zone.tone)}
					data-tone={zone.tone}
				></span>
			</span>
			<span class="truncate text-[0.6875rem] font-semibold text-foreground/80">{zone.name}</span>
		</span>
		<span class="mt-1 text-sm font-bold tabular-nums" data-live-kw>{formatKw(zone.liveKw)}</span>
		<span class="text-[0.625rem] text-muted-foreground tabular-nums">{formatKwh(zone.kwh)}</span>
		<span class="sr-only">{energyLabels.label("zoneTone", zone.tone)}</span>
	</a>
{/snippet}

<Card.Root data-building>
	<Card.Header>
		<Card.Title
			>{m.energy_building_heading({ site: `${site.customerName} ${site.siteName}` })}</Card.Title
		>
		<Card.Description>{m.energy_building_hint()}</Card.Description>
		<Card.Action>
			<ul
				class="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground"
				aria-label={m.energy_building_legend()}
				data-legend
			>
				{#each tones as tone (tone)}
					<li class="inline-flex items-center gap-1">
						<span class={["size-2 rounded-full", toneColours[tone]]} aria-hidden="true"></span>
						{energyLabels.label("zoneTone", tone)}
					</li>
				{/each}
			</ul>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		<div class="overflow-hidden rounded-lg border border-slate-300 dark:border-white/15">
			<div class="flex items-center gap-2 bg-slate-800 px-4 py-2 text-white dark:bg-slate-950">
				<Building2Icon class="size-4 shrink-0 text-teal-400" aria-hidden="true" />
				<span class="truncate text-sm font-semibold">{site.name}</span>
				<span class="ml-auto shrink-0 text-[0.6875rem] text-slate-300 tabular-nums"
					>{m.energy_building_total({ kw: formatKw(totalKw) })}</span
				>
			</div>
			<div class="grid bg-muted md:grid-cols-[1fr_12rem]">
				<div class="flex flex-col">
					{#each floors as { floor, zones: floorZones } (floor)}
						{@const current = selected({ kind: "floor", floor })}
						<section
							class={[
								"grid grid-cols-1 gap-3 border-b border-slate-300 p-3 last:border-b-0 sm:grid-cols-6 dark:border-white/10",
								current ? "bg-accent" : "bg-card/60",
							]}
							aria-label={floor}
							data-floor={floor}
						>
							<div class="sm:col-span-6">
								<a
									href={hrefOf({ kind: "floor", floor })}
									class={[
										"inline-flex h-6 items-center rounded-sm px-2 text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase transition-colors hover:bg-muted hover:text-foreground",
										current && "bg-primary/15 text-accent-foreground",
									]}
									aria-current={current ? "true" : undefined}
									data-sveltekit-reset="false"
									data-floor-select={floor}>{floor}</a
								>
							</div>
							{#each floorZones as zone, index (zone.id)}
								{@render zoneBlock(zone, spanOf(index, floorZones.length))}
							{/each}
						</section>
					{/each}
				</div>
				<aside
					class="flex flex-col gap-3 border-t border-slate-300 bg-muted/60 p-3 md:border-t-0 md:border-l dark:border-white/10"
					data-main-meter
				>
					<p class="text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">
						{m.energy_meter_live_title()}
					</p>
					<div class="rounded-md border-2 border-primary bg-card p-3">
						<div class="flex items-center gap-1.5">
							<ZapIcon class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
							<span class="truncate text-[0.6875rem] font-semibold">{site.meterName}</span>
						</div>
						<p class="mt-1 text-lg font-bold text-primary tabular-nums" data-meter-kw>
							{formatKw(totalKw)}
						</p>
						<div
							class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
							role="meter"
							aria-label={m.energy_meter_peak_share()}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={Math.round(peakShare)}
						>
							<div
								class={[
									"h-full rounded-full transition-[width] duration-700 ease-out",
									peakShare >= 100 ? "bg-destructive" : "bg-primary",
									totalKw > 0 && "flowing",
								]}
								style:width="{Math.min(100, Math.max(2, peakShare))}%"
								style:--flow="{flowSeconds}s"
							></div>
						</div>
						<p class="mt-1 text-[0.625rem] text-muted-foreground">
							{m.energy_meter_contract_peak({
								share: formatNumber(Math.round(peakShare)),
								kw: formatKw(site.contractedPeakKw),
							})}
						</p>
					</div>
					<div class="rounded-md border bg-card p-3 text-[0.625rem] text-muted-foreground">
						<p class="font-semibold text-foreground">{m.energy_meter_contract_title()}</p>
						<p>
							{m.energy_meter_contract_values({
								kw: formatKw(site.contractedPeakKw),
								kwh: formatKwh(site.contractedKwhPerYear),
							})}
						</p>
					</div>
					<div
						class="rounded-md border bg-card p-3 text-[0.625rem] text-muted-foreground"
						data-solar
					>
						<p class="font-semibold text-foreground">{m.energy_meter_pv()}</p>
						<p class="text-success tabular-nums">
							{m.energy_meter_pv_now({ kw: formatKw(solarKw) })}
						</p>
						<p>{m.energy_meter_pv_estimate({ kwp: formatNumber(site.pvCapacityKw) })}</p>
					</div>
				</aside>
			</div>
		</div>
		{#if outside.length}
			<section
				class="flex flex-col gap-2"
				aria-label={m.energy_no_floor()}
				data-floor={m.energy_no_floor()}
			>
				<h3 class="text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">
					{m.energy_no_floor()}
				</h3>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{#each outside as zone (zone.id)}
						{@render zoneBlock(zone, 0)}
					{/each}
				</div>
			</section>
		{/if}
	</Card.Content>
</Card.Root>

<style>
	.pulse {
		animation: zone-pulse var(--pulse) ease-in-out infinite;
	}
	.pulse[data-tone="offline"] {
		animation: none;
	}
	.halo {
		animation: zone-halo 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
	}
	.flowing {
		background-image: repeating-linear-gradient(
			-45deg,
			transparent 0 6px,
			rgb(255 255 255 / 0.28) 6px 12px
		);
		background-size: 17px 100%;
		animation: meter-flow var(--flow) linear infinite;
	}
	@keyframes zone-pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.45;
			transform: scale(0.75);
		}
	}
	@keyframes zone-halo {
		75%,
		100% {
			opacity: 0;
			transform: scale(2.4);
		}
	}
	@keyframes meter-flow {
		to {
			background-position: 17px 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse,
		.halo,
		.flowing {
			animation: none;
		}
		.halo {
			display: none;
		}
	}
</style>
