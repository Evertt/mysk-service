<!--
	@component
	The condition module's card on the customer portal's home (`client.home`,
	`#lib/client/extensions.ts`): the customer's units that are critical or need attention, worst
	first, each with its advice, linking to the unit. Nothing while none does.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { unitTitle } from "#lib/equipment/index.ts";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { getClientAttention } from "../../client/client-condition.remote.ts";
	import StatusBadge from "../../ui/status-badge.svelte";

	const data = $derived(await getClientAttention());
</script>

{#if data.units.length}
	<section
		class="flex flex-col gap-3"
		aria-label={m.condition_client_title()}
		data-client-attention
	>
		<h2 class="text-sm font-medium text-muted-foreground">
			{m.condition_client_title()}
			<span class="tabular-nums">· {formatNumber(data.total)}</span>
		</h2>
		<Card.Root class="py-0">
			<ul class="flex flex-col divide-y">
				{#each data.units as unit (unit.id)}
					<li>
						<a
							href={resolve("/(customer)/portal/equipment/[serial]", { serial: unit.serialNumber })}
							class="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent"
							data-unit={unit.serialNumber}
						>
							<span class="flex min-w-0 flex-col">
								<span class="truncate text-sm font-medium">{unitTitle(unit)}</span>
								<span class="truncate text-xs text-muted-foreground">
									{[unit.site, unit.advice].filter(Boolean).join(" · ")}
								</span>
							</span>
							<StatusBadge status={unit.status} />
						</a>
					</li>
				{/each}
			</ul>
		</Card.Root>
	</section>
{/if}
