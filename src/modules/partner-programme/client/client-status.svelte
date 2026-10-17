<!--
	@component
	A partner's year so far in the customer portal: its level ("Huidige status"), Partner Omzet and
	Bonus Omzet, the way to the next level, and the bonus it would bring in each form, not to spend
	before the year closes. Without rules for the year, only that.
-->
<script lang="ts">
	import { formatCents } from "#lib/i18n/index.ts";

	import { formatEuros } from "../display.ts";
	import type { YearFigures } from "../model.ts";
	import LevelBadge from "../ui/level-badge.svelte";
	import LevelProgress from "../ui/level-progress.svelte";

	let { figures, year }: { figures: YearFigures | null; year: number } = $props();

	const sameBonusRevenue = $derived(
		!figures || figures.bonusRevenue.cash === figures.bonusRevenue.credit,
	);
</script>

{#if figures}
	<div class="flex flex-col gap-5" data-client-status>
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-sm text-muted-foreground">{m.partners_client_current_status()}</span>
			<LevelBadge level={figures.level?.level ?? null} />
		</div>
		<dl class="grid grid-cols-2 gap-4">
			<div class="flex flex-col gap-0.5">
				<dt class="text-xs text-muted-foreground">{m.partners_partner_revenue()}</dt>
				<dd class="text-lg font-semibold tabular-nums" data-partner-revenue>
					{formatEuros(figures.partnerRevenue)}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				<dt class="text-xs text-muted-foreground">
					{sameBonusRevenue ? m.partners_bonus_revenue() : m.partners_bonus_revenue_cash()}
				</dt>
				<dd class="text-lg font-semibold tabular-nums" data-bonus-revenue>
					{formatEuros(figures.bonusRevenue.cash)}
				</dd>
			</div>
			{#if !sameBonusRevenue}
				<div class="col-span-2 flex flex-col gap-0.5">
					<dt class="text-xs text-muted-foreground">{m.partners_bonus_revenue_credit()}</dt>
					<dd class="text-lg font-semibold tabular-nums">
						{formatEuros(figures.bonusRevenue.credit)}
					</dd>
				</div>
			{/if}
		</dl>
		<LevelProgress revenue={figures.partnerRevenue} progress={figures.progress} />
		<dl class="grid grid-cols-2 gap-4">
			<div class="flex flex-col gap-0.5">
				<dt class="text-xs text-muted-foreground">{m.partners_expected_cash()}</dt>
				<dd class="font-semibold tabular-nums" data-expected-cash>
					{formatCents(figures.bonus.cash)}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				<dt class="text-xs text-muted-foreground">{m.partners_expected_credit()}</dt>
				<dd class="font-semibold tabular-nums" data-expected-credit>
					{formatCents(figures.bonus.credit)}
				</dd>
			</div>
		</dl>
		<p class="-mt-3 text-xs text-muted-foreground">{m.partners_not_yet_spendable()}</p>
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{m.partners_client_no_rules({ year: String(year) })}</p>
{/if}
