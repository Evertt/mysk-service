<!--
	@component
	A partner's year so far in the customer portal, as the SHLTR mockup's "Uw voortgang": its level,
	Partner Omzet and Bonus Omzet as key figures, the way to the next level, and the bonus it would
	bring in each form (the credit highlighted), not to spend before the year closes. Without rules
	for the year, only that.
-->
<script lang="ts">
	import CreditCardIcon from "@lucide/svelte/icons/credit-card";
	import InfoIcon from "@lucide/svelte/icons/info";
	import ShoppingBagIcon from "@lucide/svelte/icons/shopping-bag";

	import KeyFigure from "#lib/components/key-figure.svelte";
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
	<!-- Side by side where the card is wide enough, whatever the screen. -->
	<div class="@container flex flex-col gap-6" data-client-status>
		<dl class="grid gap-3 @md:grid-cols-3">
			<KeyFigure label={m.partners_client_level()}>
				<LevelBadge level={figures.level?.level ?? null} colour={figures.level?.colour} />
			</KeyFigure>
			<KeyFigure label={m.partners_partner_revenue()}>
				<span data-partner-revenue>{formatEuros(figures.partnerRevenue)}</span>
			</KeyFigure>
			<KeyFigure
				label={sameBonusRevenue ? m.partners_bonus_revenue() : m.partners_bonus_revenue_cash()}
			>
				<span data-bonus-revenue>{formatEuros(figures.bonusRevenue.cash)}</span>
			</KeyFigure>
			{#if !sameBonusRevenue}
				<KeyFigure label={m.partners_bonus_revenue_credit()} class="@md:col-start-3">
					{formatEuros(figures.bonusRevenue.credit)}
				</KeyFigure>
			{/if}
		</dl>
		<LevelProgress revenue={figures.partnerRevenue} progress={figures.progress} />
		<div class="flex flex-col gap-3">
			<dl class="grid gap-3 @md:grid-cols-2">
				<div class="flex flex-col gap-1 rounded-lg border bg-muted/50 p-4">
					<CreditCardIcon class="size-4 text-muted-foreground" aria-hidden="true" />
					<dt class="mt-2 text-xs text-muted-foreground">{m.partners_expected_cash()}</dt>
					<dd class="text-xl font-semibold tabular-nums" data-expected-cash>
						{formatCents(figures.bonus.cash)}
					</dd>
				</div>
				<div class="flex flex-col gap-1 rounded-lg border border-primary/30 bg-accent p-4">
					<ShoppingBagIcon class="size-4 text-primary" aria-hidden="true" />
					<dt class="mt-2 text-xs text-accent-foreground">{m.partners_expected_credit()}</dt>
					<dd class="text-xl font-semibold tabular-nums" data-expected-credit>
						{formatCents(figures.bonus.credit)}
					</dd>
				</div>
			</dl>
			<p class="flex items-start gap-2 text-xs text-muted-foreground">
				<InfoIcon class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
				{m.partners_not_yet_spendable()}
			</p>
		</div>
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{m.partners_client_no_rules({ year: String(year) })}</p>
{/if}
