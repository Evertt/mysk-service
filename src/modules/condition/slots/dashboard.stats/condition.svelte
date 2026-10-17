<!--
	@component
	The dashboard's tile of the units that are critical or need attention, linking to them on the
	Connect page.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import StatCard from "#lib/components/stat-card.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { getConditionOverview } from "../../overview.remote.ts";

	const data = $derived(await getConditionOverview());
</script>

<div class="contents" data-condition-stat>
	<StatCard
		label={m.condition_dashboard_title()}
		value={formatNumber(data.critical + data.attention)}
		detail={m.condition_dashboard_detail({
			critical: formatNumber(data.critical),
			attention: formatNumber(data.attention),
		})}
	>
		{#snippet action()}
			<!-- The Connect page, filtered to the units that need attention. -->
			<Button
				variant="outline"
				size="sm"
				href="{resolve('/(app)/(modules)/condition')}?status=critical,attention"
			>
				{m.common_view()}
			</Button>
		{/snippet}
	</StatCard>
</div>
