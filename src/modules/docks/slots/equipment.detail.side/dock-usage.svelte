<!--
	@component
	The docks module's card on a unit's page (`equipment.detail.side`), for a dock's door or
	leveller: the dock, its sessions today and its average door-open time over the last 30 days,
	and (for the door) the open breakdown orders the door rules made on it. Nothing for other units.
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
	import { formatNumber, formatStopwatch } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import { getDockUsage } from "../../docks.remote.ts";

	let { serialNumber }: { serialNumber: string } = $props();

	const usage = $derived(await getDockUsage(serialNumber));
</script>

{#if usage}
	<Card.Root data-dock-usage>
		<Card.Header>
			<Card.Title>{m.docks_usage_title()}</Card.Title>
			<Card.Description>
				{m.docks_usage_description({ dock: usage.dock.code, site: usage.dock.site })}
				{usage.dock.position ? `· ${usage.dock.position}` : ""}
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<dl class="grid grid-cols-2 gap-4">
				<DetailItem label={m.docks_usage_sessions_today()}>
					<span class="text-lg font-semibold tabular-nums" data-sessions-today>
						{formatNumber(usage.sessionsToday)}
					</span>
				</DetailItem>
				<DetailItem label={m.docks_usage_average_open()}>
					<span class="text-lg font-semibold tabular-nums" data-average-open>
						{usage.averageOpenSeconds === null
							? "—"
							: formatStopwatch(usage.averageOpenSeconds * 1000, { hours: true })}
					</span>
				</DetailItem>
			</dl>
			<p class="-mt-2 text-xs text-muted-foreground">
				{m.docks_usage_last_30_days({ sessions: formatNumber(usage.recentSessions) })}
			</p>
			{#if usage.openOrders.length}
				<div class="flex flex-col gap-1 text-sm">
					<span class="text-muted-foreground">{m.docks_usage_open_orders()}</span>
					{#each usage.openOrders as number (number)}
						<OrderLink {number} class="font-medium underline-offset-4 hover:underline" />
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
