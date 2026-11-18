<!--
	The partner's Partner Bonus page in the customer portal: the programme's banner ("Samen groeien.
	Meer voordeel."), this year's level and figures so far with the bonus they'd bring, a closed
	year's bonus to choose (once), its wallet (the mockup's dark panel) with its entries, its last
	closed years, and the programme in tabs: its levels, the revenue that counts, the year's cycle
	and the conditions, one under the other. For a customer that isn't a partner, only that it
	isn't.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import AwardIcon from "@lucide/svelte/icons/award";

	import AppBar from "#lib/client/app-bar.svelte";
	import PageBanner from "#lib/components/page-banner.svelte";
	import { formatCents, formatWholeEuros } from "#lib/i18n/index.ts";
	import ClientChoice from "#modules/partner-programme/client/client-choice.svelte";
	import { getClientPartner } from "#modules/partner-programme/client/client-partner.remote.ts";
	import ClientProgramme from "#modules/partner-programme/client/client-programme.svelte";
	import ClientStatus from "#modules/partner-programme/client/client-status.svelte";
	import ClientWallet from "#modules/partner-programme/client/client-wallet.svelte";
	import { partnerLabels } from "#modules/partner-programme/labels.ts";
	import LevelBadge from "#modules/partner-programme/ui/level-badge.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(customer)/(modules)/partner-programme/portal"> } =
		$props();

	const data = $derived(await getClientPartner());
</script>

<AppBar
	title={m.partners_client_title()}
	back={{ href: resolve("/(customer)/portal/more"), label: m.client_tab_more() }}
/>

{#if !data.partner}
	<p class="px-1 text-[0.9375rem] text-muted-foreground">{m.partners_client_description()}</p>
	<Empty.Root class="rounded-xl border bg-card" data-client-not-partner>
		<Empty.Header>
			<Empty.Media variant="icon"><AwardIcon /></Empty.Media>
			<Empty.Title>{m.partners_client_not_partner()}</Empty.Title>
			<Empty.Description>{m.partners_client_not_partner_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<PageBanner
		heading="h2"
		eyebrow={m.partners_client_hero_eyebrow({ organization: data.organization })}
		title={m.partners_client_hero_title()}
		description={m.partners_client_hero_intro({ organization: data.organization })}
	/>

	<div class="flex flex-col gap-5">
		<Card.Root class="rounded-xl" data-client-bonus>
			<Card.Header>
				<Card.Title>{m.partners_card_title({ year: String(data.year) })}</Card.Title>
				<Card.Description>{m.partners_client_bonus_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<ClientStatus figures={data.figures} year={data.year} />
			</Card.Content>
		</Card.Root>

		{#if data.awaiting}
			<ClientChoice awaiting={data.awaiting} />
		{/if}

		<ClientWallet wallet={data.wallet} entries />
	</div>

	{#if data.closed.length}
		<section class="flex flex-col gap-2" aria-label={m.partners_client_closed_years()}>
			<h2 class="section-label px-1">{m.partners_client_closed_years()}</h2>
			<div class="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
				{#each data.closed as closed (closed.year)}
					<div
						class="flex flex-col gap-1 px-4 py-3.5 text-[0.9375rem]"
						data-client-closed-year={closed.year}
					>
						<div class="flex items-center justify-between gap-2">
							<span class="font-medium"
								>{m.partners_closed_title({ year: String(closed.year) })}</span
							>
							<LevelBadge level={closed.level} colour={closed.colour} />
						</div>
						<span class="text-[0.8125rem] text-muted-foreground tabular-nums">
							{m.partners_closed_figures({
								revenue: formatWholeEuros(closed.partnerRevenue),
								bonus: formatWholeEuros(closed.bonusRevenue),
							})}
						</span>
						{#if closed.choice}
							<span data-choice={closed.choice}>
								{m.partners_closed_chosen({
									form: partnerLabels.label("bonusForm", closed.choice),
									amount: formatCents(
										closed.choice === "cash" ? closed.cashAmount : closed.creditAmount,
									),
								})}
							</span>
							{#if closed.paidWith}
								<span
									class="text-[0.8125rem] text-muted-foreground"
									data-client-credit-note={closed.paidWith.number}
								>
									{closed.paidWith.settled
										? m.partners_client_paid_with({ number: closed.paidWith.number })
										: m.partners_client_paying_with({ number: closed.paidWith.number })}
								</span>
							{/if}
						{:else if closed.cashAmount || closed.creditAmount}
							<span class="text-muted-foreground">{m.partners_client_choose_above()}</span>
						{:else}
							<span class="text-muted-foreground">{m.partners_closed_no_bonus()}</span>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.rules}
		<ClientProgramme rules={data.rules} />
	{/if}
{/if}
