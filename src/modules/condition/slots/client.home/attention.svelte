<!--
	@component
	The condition module's card on the customer portal's home (`client.home`,
	`#lib/client/extensions.ts`): the customer's units that are critical or need attention, worst
	first, each with its advice, linking to the unit, and its components with their condition and
	advice. Nothing while none does.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { unitTitle } from "#lib/equipment/index.ts";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { getClientAttention } from "../../client/client-condition.remote.ts";
	import type { ScoreBand } from "../../model.ts";
	import ConditionBar from "../../ui/condition-bar.svelte";
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
					<li class="flex flex-col">
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
						{#if unit.components.length}
							<ul
								class="flex flex-col gap-2 px-4 pb-3"
								aria-label={m.condition_client_components()}
								data-unit-components={unit.serialNumber}
							>
								{#each unit.components as part (part.id)}
									<li class="flex flex-col gap-1 border-l-2 pl-3" data-component={part.number}>
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span class="text-sm">{part.name}</span>
											<ConditionBar
												score={part.score}
												band={part.band === "none" ? null : (part.band as ScoreBand)}
											/>
										</div>
										{#if part.advice}
											<span class="text-xs text-muted-foreground">{part.advice}</span>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		</Card.Root>
	</section>
{/if}
