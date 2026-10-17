<!--
	@component
	The selection's detail ("Detail · <selectie>"), after the mockup: its live power, peak and
	consumption over the period and how many zones it has, and its installations that draw the most
	now (estimated: a zone has one meter); for a zone, a link to its own page.
-->
<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import CpuIcon from "@lucide/svelte/icons/cpu";
	import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
	import ServerIcon from "@lucide/svelte/icons/server";
	import WindIcon from "@lucide/svelte/icons/wind";
	import ZapIcon from "@lucide/svelte/icons/zap";

	import { formatNumber } from "#lib/i18n/index.ts";

	import { formatKw, formatKwh } from "../display.ts";

	let {
		scopeLabel,
		liveKw,
		peakKw,
		kwh,
		zones,
		installations,
		zoneHref,
	}: {
		scopeLabel: string;
		liveKw: number;
		peakKw: number;
		kwh: number;
		zones: number;
		installations: { id: number; name: string; kwNow: number }[];
		/** The selected zone's own page, if a zone is selected. */
		zoneHref?: string;
	} = $props();

	const tiles = $derived([
		{ id: "live", label: m.energy_panel_live(), value: formatKw(liveKw) },
		{ id: "peak", label: m.energy_panel_peak(), value: formatKw(peakKw) },
		{ id: "consumption", label: m.energy_panel_consumption(), value: formatKwh(kwh) },
		{ id: "zones", label: m.energy_panel_zones(), value: formatNumber(zones) },
	]);

	/** An installation's icon, by what its name says it is. */
	function iconOf(name: string) {
		const text = name.toLowerCase();
		if (/server|rack|ups/.test(text)) return ServerIcon;
		if (/hvac|klimaat|compressor|koel|cool|lucht|air|ventil/.test(text)) return WindIcon;
		if (/verlichting|led|light|lamp/.test(text)) return LightbulbIcon;
		if (/transport|conveyor|band|lift/.test(text)) return ActivityIcon;
		if (/robot|machine|automaat|etiket/.test(text)) return CpuIcon;
		return ZapIcon;
	}
</script>

<Card.Root data-detail-panel>
	<Card.Header>
		<Card.Title>{m.energy_panel_title({ scope: scopeLabel })}</Card.Title>
		<Card.Description>{m.energy_panel_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<dl class="grid grid-cols-2 gap-3">
			{#each tiles as tile (tile.id)}
				<div class="rounded-md bg-muted p-3" data-panel={tile.id}>
					<dt class="text-[0.6875rem] text-muted-foreground">{tile.label}</dt>
					<dd class="mt-1 text-base font-semibold whitespace-nowrap tabular-nums xl:text-lg">
						{tile.value}
					</dd>
				</div>
			{/each}
		</dl>
		<div class="flex flex-col gap-2">
			<h3 class="text-xs font-semibold text-muted-foreground uppercase">
				{m.energy_panel_installations()}
			</h3>
			{#if installations.length}
				<ul class="flex flex-col gap-2" data-installations>
					{#each installations as installation (installation.id)}
						{@const Icon = iconOf(installation.name)}
						<li class="flex items-center gap-2 text-sm" data-installation={installation.name}>
							<span
								class="grid size-7 shrink-0 place-items-center rounded-sm bg-accent text-accent-foreground"
							>
								<Icon class="size-3.5" aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1 truncate">{installation.name}</span>
							<strong class="text-xs tabular-nums">{formatKw(installation.kwNow)}</strong>
						</li>
					{/each}
				</ul>
				<p class="text-[0.6875rem] text-muted-foreground">
					{m.energy_panel_installations_estimate()}
				</p>
			{:else}
				<p class="text-sm text-muted-foreground">{m.energy_panel_no_installations()}</p>
			{/if}
		</div>
		{#if zoneHref}
			<Button variant="outline" size="sm" href={zoneHref} class="self-start" data-zone-page>
				{m.energy_selection_zone_page()}
				<ArrowRightIcon data-icon="inline-end" />
			</Button>
		{/if}
	</Card.Content>
</Card.Root>
