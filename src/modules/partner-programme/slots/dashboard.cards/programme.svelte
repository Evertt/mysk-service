<!--
	@component
	The partner programme's card on the dashboard (`dashboard.cards`): this year's partners by the
	level they've reached so far, and the credit in their wallets that's still to spend.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import StatTile from "#lib/components/stat-tile.svelte";
	import { formatCents, formatNumber } from "#lib/i18n/index.ts";

	import { getProgrammeOverview } from "../../overview.remote.ts";
	import LevelBadge from "../../ui/level-badge.svelte";

	const overview = $derived(await getProgrammeOverview());
	const reached = $derived(overview.levels.filter((each) => each.count > 0));
</script>

<Card.Root data-partner-overview>
	<Card.Header>
		<Card.Title>{m.partners_dashboard_title({ year: String(overview.year) })}</Card.Title>
		<Card.Description
			>{m.partners_dashboard_description({ count: overview.partners })}</Card.Description
		>
		<Card.Action>
			<Button variant="outline" size="sm" href={resolve("/(app)/(modules)/partner-programme")}>
				{m.partners_all()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<StatTile
			layout="figure"
			label={m.partners_dashboard_credit()}
			value={formatCents(overview.credit)}
		/>
		{#if reached.length}
			<ul class="flex flex-col divide-y text-sm">
				{#each reached as each (each.level ?? "")}
					<li
						class="flex items-center justify-between gap-3 py-1.5"
						data-level-count={each.level ?? ""}
					>
						<LevelBadge level={each.level} colour={each.colour} />
						<span class="tabular-nums">{formatNumber(each.count)}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">{m.partners_dashboard_empty()}</p>
		{/if}
	</Card.Content>
</Card.Root>
