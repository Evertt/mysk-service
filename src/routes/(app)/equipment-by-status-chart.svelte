<!--
	@component
	The dashboard's equipment by status: a horizontal bar per status in the status badges' colours,
	its count at the end, and the same numbers in a visually hidden table.
-->
<script lang="ts">
	import { BarChart } from "layerchart";

	import type { ChartConfig } from "#lib/components/ui/chart/index.ts";
	import { statuses } from "#lib/equipment/display.ts";
	import { formatNumber } from "#lib/i18n";
	import { type EquipmentStatus, equipmentStatuses } from "#lib/models.ts";

	import ChartTable from "./chart-table.svelte";
	import type { EquipmentOfStatus } from "./dashboard-charts.ts";

	let { data }: { data: EquipmentOfStatus[] } = $props();

	/** Whole numbers only on the count axis. */
	const countTick = (value: number) => (Number.isInteger(value) ? formatNumber(value) : "");

	// The statuses are in the config for the tooltip's label (`labelKey`), which is the row's status.
	const config = $derived({
		count: { label: m.dashboard_column_units() },
		...Object.fromEntries(
			equipmentStatuses.map((status) => [
				status,
				{ label: statuses[status].label, color: statuses[status].color },
			]),
		),
	} satisfies ChartConfig);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.dashboard_equipment_by_status()}</Card.Title>
		<Card.Description>{m.dashboard_equipment_by_status_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<Chart.Container {config} class="aspect-auto h-48 w-full" aria-hidden="true">
			<BarChart
				{data}
				orientation="horizontal"
				x="count"
				y="status"
				c="status"
				cDomain={[...equipmentStatuses]}
				cRange={equipmentStatuses.map((status) => statuses[status].color)}
				series={[{ key: "count", label: config.count.label }]}
				labels={{ format: countTick }}
				padding={{ left: 112, right: 32 }}
				props={{
					xAxis: { format: countTick },
					yAxis: { format: (status: EquipmentStatus) => statuses[status].label },
				}}
			>
				{#snippet tooltip()}
					<Chart.Tooltip labelKey="status" hideIndicator />
				{/snippet}
			</BarChart>
		</Chart.Container>
		<ChartTable
			caption={m.dashboard_equipment_by_status()}
			columns={[m.dashboard_column_status(), m.dashboard_column_units()]}
			rows={data.map((row) => [statuses[row.status].label, formatNumber(row.count)])}
		/>
	</Card.Content>
</Card.Root>
