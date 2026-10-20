<!--
	@component
	An engineer's work on their page, the main column's: their open orders, hours and revenue, the
	orders they have open and those they completed last. Loads it alongside the engineer.
-->
<script lang="ts">
	import StatTile from "#lib/components/stat-tile.svelte";
	import { formatCents, formatNumber } from "#lib/i18n/index.ts";

	import { getEngineerWork } from "../engineers.remote.ts";
	import EngineerOrders from "./engineer-orders.svelte";

	let { engineer }: { engineer: { id: number; name: string } } = $props();

	const work = $derived(await getEngineerWork(String(engineer.id)));
</script>

<div class="grid gap-4 sm:grid-cols-3">
	<StatTile
		layout="card"
		label={m.engineers_stats_open_orders()}
		value={formatNumber(work.stats.openOrders)}
	/>
	<StatTile
		layout="card"
		label={m.engineers_stats_hours()}
		value={m.common_count_hours_short({ count: work.stats.hours })}
	/>
	<StatTile
		layout="card"
		label={m.engineers_stats_revenue()}
		value={formatCents(work.stats.revenue)}
	/>
</div>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.engineers_open_title()}</Card.Title>
		<Card.Description>{m.engineers_open_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if work.openOrders.length}
			<EngineerOrders
				rows={work.openOrders}
				dateLabel={m.engineers_orders_column_scheduled()}
				date={(row) => row.scheduledFor}
			/>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.engineers_open_empty_title()}</Empty.Title>
					<Empty.Description>
						{m.engineers_open_empty_description({ name: engineer.name })}
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.engineers_recent_title()}</Card.Title>
		<Card.Description>
			{m.engineers_recent_description({ count: formatNumber(10) })}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if work.completedOrders.length}
			<EngineerOrders
				rows={work.completedOrders}
				dateLabel={m.engineers_orders_column_completed()}
				date={(row) => row.completedAt}
			/>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.engineers_recent_empty_title()}</Empty.Title>
					<Empty.Description>{m.engineers_recent_empty_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
