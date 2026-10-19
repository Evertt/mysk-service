<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import { toast } from "svelte-sonner";

	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatKw, formatKwh, formatPercent, stateBadges } from "#modules/energy/display.ts";
	import { energyLabels } from "#modules/energy/labels.ts";
	import { getEnergyThresholds, saveEnergyThreshold } from "#modules/energy/thresholds.remote.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/energy/[site]/thresholds"> } = $props();

	const data = $derived(await getEnergyThresholds(Number(params.site)));
	const siteHref = $derived(resolve("/(app)/(modules)/energy/[site]", { site: params.site }));
</script>

<svelte:head>
	<title>{m.energy_thresholds_title()} · {data.site.name}</title>
</svelte:head>

<div class="flex max-w-4xl flex-col gap-6">
	<PageHeader
		title={m.energy_thresholds_title()}
		description={m.energy_thresholds_description()}
		breadcrumbs={[
			{ label: m.energy_title(), href: resolve("/(app)/(modules)/energy") },
			{ label: data.site.name, href: siteHref },
			{ label: m.energy_thresholds_title() },
		]}
	/>

	{#if !data.canManage}
		<p class="text-sm text-muted-foreground" data-managers-only>{m.energy_thresholds_managers()}</p>
	{/if}

	<ul class="flex flex-col gap-3">
		{#each data.zones as zone (zone.id)}
			{@const form = saveEnergyThreshold.for(String(zone.id))}
			<li>
				<Card.Root size="sm" data-threshold={zone.code}>
					<Card.Header>
						<Card.Title>
							<span class="font-mono text-xs text-muted-foreground">{zone.code}</span>
							{zone.name}
						</Card.Title>
						<Card.Description>
							{m.energy_thresholds_now({
								kw: formatKw(zone.liveKw),
								kwh: formatKwh(zone.kwhToday),
								share: formatPercent(zone.ratio * 100),
							})}
						</Card.Description>
						<Card.Action>
							<Badge variant={stateBadges[zone.state]} data-state={zone.state}>
								{energyLabels.label("thresholdState", zone.state)}
							</Badge>
						</Card.Action>
					</Card.Header>
					<Card.Content>
						{#if data.canManage}
							<form
								{...form.enhance(async ({ submit }) => {
									await submitted(submit);
									if (!form.fields.allIssues()?.length) toast.success(m.energy_thresholds_saved());
								})}
								class="grid items-end gap-4 sm:grid-cols-[auto_1fr_1fr_auto]"
							>
								<input {...form.fields.zoneId.as("hidden", String(zone.id))} />
								<CheckboxField
									field={form.fields.enabled}
									label={m.energy_threshold_enabled()}
									checked={zone.threshold?.enabled ?? false}
								/>
								<NumberField
									field={form.fields.maxKw}
									label={m.energy_threshold_max_kw()}
									value={zone.threshold?.maxKw}
									min={0}
									step="any"
								/>
								<NumberField
									field={form.fields.maxKwh}
									label={m.energy_threshold_max_kwh()}
									value={zone.threshold?.maxKwh}
									min={0}
									step="any"
								/>
								<SubmitButton size="sm" pending={form.pending}>{m.energy_save()}</SubmitButton>
							</form>
						{:else}
							<dl class="grid grid-cols-3 gap-3 text-sm">
								<div>
									<dt class="text-xs text-muted-foreground">{m.energy_threshold_enabled()}</dt>
									<dd>{zone.threshold?.enabled ? m.energy_on() : m.energy_off()}</dd>
								</div>
								<div>
									<dt class="text-xs text-muted-foreground">{m.energy_threshold_max_kw()}</dt>
									<dd class="tabular-nums">
										{zone.threshold ? formatKw(zone.threshold.maxKw) : "—"}
									</dd>
								</div>
								<div>
									<dt class="text-xs text-muted-foreground">{m.energy_threshold_max_kwh()}</dt>
									<dd class="tabular-nums">
										{zone.threshold ? formatKwh(zone.threshold.maxKwh) : "—"}
									</dd>
								</div>
							</dl>
						{/if}
					</Card.Content>
				</Card.Root>
			</li>
		{/each}
	</ul>
</div>
