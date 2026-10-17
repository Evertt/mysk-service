<!--
	@component
	The comparison per zone ("Vergelijking per zone"): each zone's power now, its consumption this
	period and the previous one, the difference, its peak and its state.
-->
<script lang="ts">
	import { changeClass, formatChange, formatKw, formatKwh, toneBadges } from "../display.ts";
	import { energyLabels } from "../labels.ts";
	import type { ZoneFigures } from "../server/figures.ts";
	import { comparisonOf } from "./scope.ts";

	let { zones, previousComplete }: { zones: ZoneFigures[]; previousComplete: boolean } = $props();

	const rows = $derived(zones.map((zone) => comparisonOf(zone, previousComplete)));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.energy_comparison_title()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<div class="overflow-x-auto">
			<Table.Root data-comparison>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.energy_column_zone()}</Table.Head>
						<Table.Head class="text-right">{m.energy_column_live()}</Table.Head>
						<Table.Head class="text-right">{m.energy_column_current()}</Table.Head>
						<Table.Head class="text-right">{m.energy_column_previous()}</Table.Head>
						<Table.Head class="text-right">{m.energy_column_difference()}</Table.Head>
						<Table.Head class="text-right">{m.energy_column_peak()}</Table.Head>
						<Table.Head>{m.energy_column_status()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as row (row.id)}
						<Table.Row data-zone-row={row.code}>
							<Table.Cell>
								<span class="font-mono text-xs text-muted-foreground">{row.code}</span>
								<span class="ml-1">{row.name}</span>
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{formatKw(row.liveKw)}</Table.Cell>
							<Table.Cell class="text-right tabular-nums" data-current
								>{formatKwh(row.kwh)}</Table.Cell
							>
							<Table.Cell class="text-right tabular-nums">{formatKwh(row.previousKwh)}</Table.Cell>
							<Table.Cell class={["text-right tabular-nums", changeClass(row.change)]}>
								{formatChange(row.change)}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{formatKw(row.peakKw)}</Table.Cell>
							<Table.Cell>
								<Badge variant={toneBadges[row.tone]}>
									{energyLabels.label("zoneTone", row.tone)}
								</Badge>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</Card.Content>
</Card.Root>
