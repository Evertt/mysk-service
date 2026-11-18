<!--
	@component
	A site's maintenance report, in the office and in the customer portal, on an A4 sheet
	(`PrintSheet`) that prints alone: the period to choose (`from`/`to` in the URL, submitted with
	GET, as energy's report) and the print button, then the header (the site, its customer, the
	period, when it was made), the summary by section (core's and the modules', `siteSummary`), each
	unit with the modules' facts about it, and the faults and orders of the period. `orderLink`
	renders an order's number as a link in the shell. A module that's off has no section or column.
-->
<script lang="ts">
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import type { Snippet } from "svelte";

	import EnumBadge from "#lib/components/enum-badge.svelte";
	import PrintSheet from "#lib/components/print-sheet.svelte";
	import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
	import { unitTitle } from "#lib/equipment/index.ts";
	import { formatDate, formatDateTime } from "#lib/i18n/index.ts";
	import type { OrderStatus, OrderType } from "#lib/models.ts";
	import { TypeLabel } from "#lib/orders/components.ts";
	import { orderStatusDisplay } from "#lib/orders/index.ts";

	import { siteAddressLine } from "../address.ts";
	import type { SiteFigure, SitePeriod, UnitFact } from "../extensions.ts";
	import { figureValue, sectionsOf } from "./figures.ts";

	let {
		report,
		orderLink,
	}: {
		report: {
			organization: string;
			site: {
				name: string;
				address: string;
				postalCode: string;
				city: string;
				customer: { name: string };
			};
			period: SitePeriod;
			madeAt: Temporal.Instant;
			figures: readonly SiteFigure[];
			columns: readonly { id: string; label: string }[];
			units: readonly {
				id: number;
				serialNumber: string;
				name: string | null;
				manufacturer: string;
				model: string;
				location: string | null;
				facts: Record<string, UnitFact>;
			}[];
			orders: readonly {
				id: number;
				number: string;
				type: OrderType;
				status: OrderStatus;
				description: string;
				createdAt: Temporal.Instant;
				completedAt: Temporal.Instant | null;
				fault: boolean;
			}[];
		};
		orderLink: Snippet<[{ number: string }]>;
	} = $props();

	const sections = $derived(sectionsOf(report.figures));

	/** A fact's tone as its text's colour. */
	const toneClass = (tone?: BadgeTone) =>
		tone === "danger"
			? "text-destructive"
			: tone === "warning"
				? "text-warning"
				: tone === "success"
					? "text-success"
					: undefined;
</script>

<div class="flex flex-col gap-4" data-site-report-page>
	<form method="GET" class="flex flex-wrap items-end gap-3 print:hidden">
		<label class="flex flex-col gap-1 text-sm">
			{m.customers_report_from()}
			<Input type="date" name="from" value={report.period.from.toString()} required />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			{m.customers_report_to()}
			<Input type="date" name="to" value={report.period.to.toString()} required />
		</label>
		<Button type="submit" variant="outline">{m.customers_report_show()}</Button>
		<Button type="button" onclick={() => window.print()}>
			<PrinterIcon data-icon="inline-start" />
			{m.customers_report_print()}
		</Button>
	</form>

	<PrintSheet class="flex flex-col gap-6 print:text-black" data-site-report>
		<header class="flex flex-col gap-1 border-b pb-4">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">
				{report.organization} · {report.site.customer.name}
			</p>
			<h1 class="text-2xl font-semibold">{m.customers_report_title()} · {report.site.name}</h1>
			<p class="text-sm text-muted-foreground">{siteAddressLine(report.site)}</p>
			<p class="text-sm" data-report-period>
				{m.customers_report_period({
					period: formatDate.range(report.period.from, report.period.to),
					customer: report.site.customer.name,
				})}
			</p>
			<p class="text-xs text-muted-foreground">
				{m.customers_report_made({ when: formatDateTime(report.madeAt) })}
			</p>
		</header>

		<section class="flex flex-col gap-3" aria-labelledby="report-summary">
			<h2 id="report-summary" class="text-lg font-semibold">{m.customers_report_summary()}</h2>
			<div class="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
				{#each sections as [section, figures] (section)}
					<div class="flex break-inside-avoid flex-col gap-1">
						<h3 class="text-sm font-medium text-muted-foreground">{section}</h3>
						<dl class="flex flex-col divide-y rounded-md border text-sm">
							{#each figures as figure (figure.id)}
								<div class="flex items-baseline justify-between gap-3 px-3 py-1.5">
									<dt>{figure.label}</dt>
									<dd class="font-medium tabular-nums" data-report-figure={figure.id}>
										{figureValue(figure)}
									</dd>
								</div>
							{/each}
						</dl>
					</div>
				{/each}
			</div>
		</section>

		<section class="flex flex-col gap-2" aria-labelledby="report-units">
			<h2 id="report-units" class="text-lg font-semibold">{m.customers_report_units()}</h2>
			{#if report.units.length}
				<div class="overflow-x-auto print:overflow-visible">
					<Table.Root data-report-units class="text-xs sm:text-sm">
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.customers_report_column_unit()}</Table.Head>
								{#each report.columns as column (column.id)}
									<Table.Head>{column.label}</Table.Head>
								{/each}
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each report.units as unit (unit.id)}
								<Table.Row class="break-inside-avoid" data-report-unit={unit.serialNumber}>
									<Table.Cell class="min-w-40 whitespace-normal">
										<span class="font-medium">{unitTitle(unit)}</span>
										<span class="block text-xs text-muted-foreground">
											{[unit.serialNumber, unit.location].filter(Boolean).join(" · ")}
										</span>
									</Table.Cell>
									{#each report.columns as column (column.id)}
										{@const fact = unit.facts[column.id]}
										<Table.Cell
											class={["whitespace-nowrap tabular-nums", toneClass(fact?.tone)]}
											data-fact={column.id}
										>
											{fact?.text ?? "–"}
										</Table.Cell>
									{/each}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.customers_report_no_units()}</p>
			{/if}
		</section>

		<section class="flex flex-col gap-2" aria-labelledby="report-orders">
			<h2 id="report-orders" class="text-lg font-semibold">{m.customers_report_orders()}</h2>
			{#if report.orders.length}
				<div class="overflow-x-auto print:overflow-visible">
					<Table.Root data-report-orders class="text-xs sm:text-sm">
						<Table.Header>
							<Table.Row>
								<Table.Head>{m.customers_report_column_order()}</Table.Head>
								<Table.Head>{m.customers_report_column_status()}</Table.Head>
								<Table.Head>{m.customers_report_column_created()}</Table.Head>
								<Table.Head>{m.customers_report_column_completed()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each report.orders as order (order.id)}
								<Table.Row class="break-inside-avoid" data-report-order={order.number}>
									<Table.Cell class="min-w-48 whitespace-normal">
										<span class="flex flex-wrap items-center gap-2">
											{@render orderLink(order)}
											<TypeLabel type={order.type} />
											{#if order.fault}
												<Badge variant="danger">{m.customers_report_fault()}</Badge>
											{/if}
										</span>
										<span class="mt-1 line-clamp-2 block text-muted-foreground">
											{order.description}
										</span>
									</Table.Cell>
									<Table.Cell>
										<EnumBadge display={orderStatusDisplay} value={order.status} />
									</Table.Cell>
									<Table.Cell class="whitespace-nowrap tabular-nums">
										{formatDate(order.createdAt)}
									</Table.Cell>
									<Table.Cell class="whitespace-nowrap tabular-nums">
										{order.completedAt ? formatDate(order.completedAt) : "–"}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">{m.customers_report_no_orders()}</p>
			{/if}
		</section>
	</PrintSheet>
</div>
