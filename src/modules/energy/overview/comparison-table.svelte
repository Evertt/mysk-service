<!--
	@component
	The comparison per zone ("Vergelijking per zone"): each zone's power now, its consumption this
	period and the previous one, the difference, its peak and its state, with how many zones the
	selection has. With `hrefOf`, a row selects its zone on the site's page (the selected one tinted).
-->
<script lang="ts">
	import Building2Icon from "@lucide/svelte/icons/building-2";

	import EnumBadge from "#lib/components/enum-badge.svelte";

	import { changeClass, formatChange, formatKw, formatKwh, zoneToneDisplay } from "../display.ts";
	import type { ZoneFigures } from "../server/figures.ts";
	import { comparisonOf, type Scope } from "./scope.ts";

	let {
		zones,
		previousComplete,
		hrefOf,
		selected,
	}: {
		zones: ZoneFigures[];
		previousComplete: boolean;
		/** The site's page with a zone selected, for a row to link to. */
		hrefOf?: (scope: Scope) => string;
		/** The selected zone's code, if one is. */
		selected?: string;
	} = $props();

	const rows = $derived(zones.map((zone) => comparisonOf(zone, previousComplete)));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="flex items-center gap-2">
			<Building2Icon class="size-4 text-primary" aria-hidden="true" />
			{m.energy_comparison_title()}
		</Card.Title>
		<Card.Action>
			<span class="text-xs text-muted-foreground">
				{m.energy_comparison_count({ count: zones.length })}
			</span>
		</Card.Action>
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
						<Table.Row
							class={["relative", row.code === selected && "bg-accent"]}
							data-zone-row={row.code}
						>
							<Table.Cell>
								{#if hrefOf}
									<a
										href={hrefOf({ kind: "zone", code: row.code })}
										class="font-medium after:absolute after:inset-0 hover:text-primary focus-visible:outline-none"
										aria-current={row.code === selected ? "true" : undefined}
										data-sveltekit-reset="false">{row.name}</a
									>
								{:else}
									<span class="font-medium">{row.name}</span>
								{/if}
								<span class="block text-[0.6875rem] text-muted-foreground">
									{[row.floor, row.code].filter(Boolean).join(" · ")}
								</span>
							</Table.Cell>
							<Table.Cell class="text-right font-semibold tabular-nums"
								>{formatKw(row.liveKw)}</Table.Cell
							>
							<Table.Cell class="text-right tabular-nums" data-current
								>{formatKwh(row.kwh)}</Table.Cell
							>
							<Table.Cell class="text-right tabular-nums">{formatKwh(row.previousKwh)}</Table.Cell>
							<Table.Cell class={["text-right tabular-nums", changeClass(row.change)]}>
								{formatChange(row.change)}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{formatKw(row.peakKw)}</Table.Cell>
							<Table.Cell>
								<EnumBadge display={zoneToneDisplay} value={row.tone} />
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</Card.Content>
</Card.Root>
