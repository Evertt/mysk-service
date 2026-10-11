<!--
	@component
	The maintenance module's card on the dashboard (`dashboard.cards`, `#lib/dashboard/extensions.ts`):
	how many plans are overdue and due within 30 days, each linking to the due list with that range.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import StatCard from "#lib/components/stat-card.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { getMaintenanceOverview } from "../../overview.remote.ts";

	const data = $derived(await getMaintenanceOverview());
	const list = resolve("/(app)/(modules)/maintenance");
</script>

<Card.Root data-maintenance-overview>
	<Card.Header>
		<Card.Title>{m.maintenance_title()}</Card.Title>
		<Card.Description>{m.maintenance_dashboard_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4 sm:grid-cols-2">
		<StatCard
			label={m.maintenance_dashboard_overdue()}
			value={formatNumber(data.overdue)}
			size="small"
		>
			{#snippet action()}
				<Button variant="outline" size="sm" href="{list}?due=overdue" data-range="overdue">
					{m.common_view()}
				</Button>
			{/snippet}
		</StatCard>
		<StatCard label={m.maintenance_dashboard_soon()} value={formatNumber(data.soon)} size="small">
			{#snippet action()}
				<!-- The due list's default range: overdue plus the next 30 days. -->
				<Button variant="outline" size="sm" href={list} data-range="30-days">
					{m.common_view()}
				</Button>
			{/snippet}
		</StatCard>
	</Card.Content>
</Card.Root>
