<!--
	@component
	The comparison per zone in the customer portal, as a phone app's rows instead of the office's
	table (`../overview/comparison-table.svelte`, which scrolls sideways on a phone): per zone its
	name, its consumption this period against the previous one, the difference and its state. The
	same figures (`comparisonOf()`), read-only.
-->
<script lang="ts">
	import EnumBadge from "#lib/components/enum-badge.svelte";

	import { changeClass, formatChange, formatKwh, zoneToneDisplay } from "../display.ts";
	import { comparisonOf } from "../overview/scope.ts";
	import type { ZoneFigures } from "../server/figures.ts";

	let { zones, previousComplete }: { zones: ZoneFigures[]; previousComplete: boolean } = $props();

	const rows = $derived(zones.map((zone) => comparisonOf(zone, previousComplete)));
</script>

<Card.Root class="rounded-xl" data-comparison>
	<Card.Header>
		<Card.Title>{m.energy_comparison_title()}</Card.Title>
		<Card.Action>
			<span class="text-[0.8125rem] text-muted-foreground">
				{m.energy_comparison_count({ count: zones.length })}
			</span>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<ul class="flex flex-col divide-y">
			{#each rows as row (row.id)}
				<li class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-zone-row={row.code}>
					<div class="flex items-start justify-between gap-3">
						<span class="flex min-w-0 flex-col gap-0.5">
							<span class="truncate text-[0.9375rem] font-medium">{row.name}</span>
							<span class="truncate text-[0.8125rem] text-muted-foreground">
								{[row.floor, row.code].filter(Boolean).join(" · ")}
							</span>
						</span>
						<span class="flex shrink-0 flex-col items-end gap-1">
							<span
								class={["text-[0.9375rem] font-semibold tabular-nums", changeClass(row.change)]}
								data-change
							>
								<span class="sr-only">{m.energy_column_difference()}:</span>
								{formatChange(row.change)}
							</span>
							<EnumBadge display={zoneToneDisplay} value={row.tone} />
						</span>
					</div>
					<dl class="grid grid-cols-2 gap-3 text-[0.8125rem]">
						<div class="flex flex-col gap-0.5">
							<dt class="text-muted-foreground">{m.energy_column_current()}</dt>
							<dd class="font-medium tabular-nums" data-current>{formatKwh(row.kwh)}</dd>
						</div>
						<div class="flex flex-col gap-0.5">
							<dt class="text-muted-foreground">{m.energy_column_previous()}</dt>
							<dd class="tabular-nums" data-previous>{formatKwh(row.previousKwh)}</dd>
						</div>
					</dl>
				</li>
			{/each}
		</ul>
	</Card.Content>
</Card.Root>
