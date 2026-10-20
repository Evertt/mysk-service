<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { RouteParams } from "$app/types";
	import PrinterIcon from "@lucide/svelte/icons/printer";

	import { formatCents, formatDate, formatDateTime, formatNumber } from "#lib/i18n/index.ts";
	import {
		changeClass,
		formatChange,
		formatCo2,
		formatKw,
		formatKwh,
	} from "#modules/energy/display.ts";
	import { getEnergyReport } from "#modules/energy/energy.remote.ts";
	import { energyLabels } from "#modules/energy/labels.ts";
	import { changePercent } from "#modules/energy/model.ts";
	import EnergyChart from "#modules/energy/overview/energy-chart.svelte";
	import SavingsAdvice from "#modules/energy/overview/savings-advice.svelte";
	import { comparisonOf, kpisOf, seriesOf } from "#modules/energy/overview/scope.ts";

	let { params }: { params: RouteParams<"/(app)/(modules)/energy/[site]/report"> } = $props();

	/** The URL's day `name`, if it's one. */
	const day = (name: string) => {
		const value = page.url.searchParams.get(name);
		return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
	};
	// The URL's days, else the server's this month so far, by the site's calendar (not the user's).
	const report = $derived(
		await getEnergyReport({ site: Number(params.site), from: day("from"), to: day("to") }),
	);
	const site = $derived(report.site);
	const kpis = $derived(kpisOf(report.zones, report.doors, site, report.previousComplete));
	const series = $derived(seriesOf(report.zones));
	const rows = $derived(report.zones.map((zone) => comparisonOf(zone, report.previousComplete)));
	const compare = (change: number | null) => (report.previousComplete ? change : null);
	const alertCount = (status?: string) =>
		report.alerts
			.filter((row) => !status || row.status === status)
			.reduce((sum, row) => sum + row.count, 0);
	const summary = $derived([
		{
			label: m.energy_report_consumption(),
			now: formatKwh(kpis.kwh),
			before: formatKwh(kpis.previousKwh),
			change: kpis.change,
		},
		{
			label: m.energy_report_cost(),
			now: formatCents(kpis.costCents),
			before: formatCents(Math.round(kpis.previousKwh * site.tariff * 100)),
			change: compare(changePercent(kpis.kwh, kpis.previousKwh)),
		},
		{
			label: m.energy_kpi_co2(),
			now: formatCo2(kpis.co2Kg),
			before: formatCo2(kpis.previousCo2Kg),
			change: compare(changePercent(kpis.co2Kg, kpis.previousCo2Kg)),
		},
		{
			label: m.energy_kpi_peak(),
			now: formatKw(kpis.peakKw),
			before: formatKw(kpis.previousPeakKw),
			change: kpis.peakChange,
		},
		{
			label: m.energy_kpi_doors(),
			now: formatKwh(kpis.doorLossKwh),
			before: formatKwh(kpis.previousDoorLossKwh),
			change: kpis.doorLossChange,
		},
	]);
	const siteHref = $derived(resolve("/(app)/(modules)/energy/[site]", { site: params.site }));
</script>

<svelte:head>
	<title>{m.energy_report_title()} · {site.name}</title>
</svelte:head>

<div class="flex max-w-5xl flex-col gap-6 print:max-w-none print:text-black" data-energy-report>
	<div class="flex flex-col gap-4 print:hidden">
		<nav class="text-sm text-muted-foreground">
			<a class="hover:underline" href={resolve("/(app)/(modules)/energy")}>{m.energy_title()}</a>
			/
			<a class="hover:underline" href={siteHref}>{site.name}</a>
		</nav>
		<form method="GET" class="flex flex-wrap items-end gap-3">
			<label class="flex flex-col gap-1 text-sm">
				{m.energy_report_from()}
				<Input type="date" name="from" value={report.first.toString()} required />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{m.energy_report_to()}
				<Input type="date" name="to" value={report.last.toString()} required />
			</label>
			<Button type="submit" variant="outline">{m.energy_report_show()}</Button>
			<Button type="button" onclick={() => window.print()}>
				<PrinterIcon data-icon="inline-start" />
				{m.energy_report_print()}
			</Button>
		</form>
	</div>

	<header class="flex flex-col gap-1 border-b pb-4">
		<p class="text-xs tracking-wide text-muted-foreground uppercase" data-report-header>
			{report.organization} · Energy Intelligence Report · {site.name}
		</p>
		<h1 class="text-2xl font-semibold">{m.energy_report_title()}</h1>
		<p class="text-sm text-muted-foreground">
			{m.energy_report_period({
				period: formatDate.range(report.first, report.last),
				days: formatNumber(report.days),
				customer: site.customerName,
				city: site.city,
			})}
		</p>
		<p class="text-xs text-muted-foreground">
			{m.energy_report_made({ when: formatDateTime(report.asOf) })}
		</p>
	</header>

	<section class="flex break-inside-avoid flex-col gap-2">
		<h2 class="text-lg font-semibold">{m.energy_report_summary()}</h2>
		<Table.Root data-report-summary>
			<Table.Header>
				<Table.Row>
					<Table.Head></Table.Head>
					<Table.Head class="text-right">{m.energy_column_current()}</Table.Head>
					<Table.Head class="text-right">{m.energy_column_previous()}</Table.Head>
					<Table.Head class="text-right">{m.energy_column_difference()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each summary as row (row.label)}
					<Table.Row>
						<Table.Cell class="font-medium">{row.label}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{row.now}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{row.before}</Table.Cell>
						<Table.Cell class={["text-right tabular-nums", changeClass(row.change)]}>
							{formatChange(row.change)}
						</Table.Cell>
					</Table.Row>
				{/each}
				<Table.Row>
					<Table.Cell class="font-medium">{m.energy_report_alerts()}</Table.Cell>
					<Table.Cell class="text-right tabular-nums" data-report-alerts>
						{formatNumber(alertCount())}
					</Table.Cell>
					<Table.Cell colspan={2} class="text-right text-muted-foreground">
						{m.energy_report_alerts_detail({
							ordered: formatNumber(alertCount("order")),
							done: formatNumber(alertCount("done")),
						})}
					</Table.Cell>
				</Table.Row>
			</Table.Body>
		</Table.Root>
	</section>

	<div class="break-inside-avoid">
		<EnergyChart
			title={m.energy_report_chart()}
			current={series.current}
			previous={series.previous}
			bucket={report.days === 1 ? "hour" : "day"}
			currentLabel={m.energy_report_this_period()}
			previousLabel={m.energy_report_previous_period()}
		/>
	</div>

	<section class="flex break-inside-avoid flex-col gap-2">
		<h2 class="text-lg font-semibold">{m.energy_comparison_title()}</h2>
		<Table.Root data-report-zones>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.energy_column_zone()}</Table.Head>
					<Table.Head class="text-right">{m.energy_column_current()}</Table.Head>
					<Table.Head class="text-right">{m.energy_column_previous()}</Table.Head>
					<Table.Head class="text-right">{m.energy_column_difference()}</Table.Head>
					<Table.Head class="text-right">{m.energy_column_peak()}</Table.Head>
					<Table.Head class="text-right">{m.energy_report_cost()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as row (row.id)}
					<Table.Row>
						<Table.Cell>
							<span class="font-mono text-xs text-muted-foreground">{row.code}</span>
							{row.name}
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatKwh(row.kwh)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatKwh(row.previousKwh)}</Table.Cell>
						<Table.Cell class={["text-right tabular-nums", changeClass(row.change)]}>
							{formatChange(row.change)}
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatKw(row.peakKw)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{formatCents(Math.round(row.kwh * site.tariff * 100))}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</section>

	{#if report.doors.length}
		<section class="flex break-inside-avoid flex-col gap-2">
			<h2 class="text-lg font-semibold">{m.energy_doors_title()}</h2>
			<Table.Root data-report-doors>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.energy_column_door()}</Table.Head>
						<Table.Head class="text-right">{m.energy_column_loss()}</Table.Head>
						<Table.Head class="text-right">{m.energy_column_previous()}</Table.Head>
						<Table.Head class="text-right">{m.energy_report_cost()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each report.doors as door (door.id)}
						<Table.Row>
							<Table.Cell>
								<span class="font-mono text-xs text-muted-foreground">{door.code}</span>
								{door.name}
								<span class="text-xs text-muted-foreground"
									>({energyLabels.label("doorKind", door.kind)})</span
								>
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{formatKwh(door.lossKwh)}</Table.Cell>
							<Table.Cell class="text-right tabular-nums"
								>{formatKwh(door.previousLossKwh)}</Table.Cell
							>
							<Table.Cell class="text-right tabular-nums">
								{formatCents(Math.round(door.lossKwh * site.tariff * 100))}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</section>
	{/if}

	<div class="break-inside-avoid">
		<SavingsAdvice {kpis} period="month" />
	</div>
</div>
