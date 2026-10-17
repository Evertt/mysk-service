<!--
	@component
	The dashboard's tile of the energy alerts that are open, how many over a threshold, linking to
	the energy sites.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ZapIcon from "@lucide/svelte/icons/zap";

	import StatTile from "#lib/components/stat-tile.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { getEnergyStat } from "../../energy.remote.ts";

	const data = $derived(await getEnergyStat());
</script>

<div class="contents" data-energy-stat>
	<StatTile
		layout="stacked"
		icon={ZapIcon}
		tone="warning"
		label={m.energy_dashboard_title()}
		value={formatNumber(data.open)}
		detail={m.energy_dashboard_detail({ active: formatNumber(data.active) })}
	>
		{#snippet action()}
			<Button variant="outline" size="sm" href={resolve("/(app)/(modules)/energy")}>
				{m.common_view()}
			</Button>
		{/snippet}
	</StatTile>
</div>
