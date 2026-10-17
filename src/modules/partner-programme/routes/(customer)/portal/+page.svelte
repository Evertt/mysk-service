<!--
	The partner's Partner Bonus page in the customer portal: this year's level and figures so far
	with the bonus they'd bring, a closed year's bonus to choose (once), its wallet with its entries,
	its last closed years, and the programme: its levels, the revenue that counts, the year's cycle
	and the conditions. For a customer that isn't a partner, only that it isn't.
-->
<script lang="ts">
	import type { RouteParams } from "$app/types";
	import AwardIcon from "@lucide/svelte/icons/award";

	import { formatCents } from "#lib/i18n/index.ts";
	import ClientChoice from "#modules/partner-programme/client/client-choice.svelte";
	import { getClientPartner } from "#modules/partner-programme/client/client-partner.remote.ts";
	import ClientProgramme from "#modules/partner-programme/client/client-programme.svelte";
	import ClientStatus from "#modules/partner-programme/client/client-status.svelte";
	import ClientWallet from "#modules/partner-programme/client/client-wallet.svelte";
	import { formatEuros } from "#modules/partner-programme/display.ts";
	import { partnerLabels } from "#modules/partner-programme/labels.ts";
	import LevelBadge from "#modules/partner-programme/ui/level-badge.svelte";

	// The props the route passes; this page needs none of them.
	const _props: { params: RouteParams<"/(customer)/(modules)/partner-programme/portal"> } =
		$props();

	const data = $derived(await getClientPartner());
</script>

<svelte:head>
	<title>{m.partners_client_title()}</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.partners_client_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.partners_client_description()}</p>
</div>

{#if !data.partner}
	<Empty.Root class="border" data-client-not-partner>
		<Empty.Header>
			<Empty.Media variant="icon"><AwardIcon /></Empty.Media>
			<Empty.Title>{m.partners_client_not_partner()}</Empty.Title>
			<Empty.Description>{m.partners_client_not_partner_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<Card.Root data-client-bonus>
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

	{#if data.closed.length}
		<section class="flex flex-col gap-3" aria-label={m.partners_client_closed_years()}>
			<h2 class="text-sm font-medium text-muted-foreground">{m.partners_client_closed_years()}</h2>
			{#each data.closed as closed (closed.year)}
				<div
					class="flex flex-col gap-1 rounded-lg border p-3 text-sm"
					data-client-closed-year={closed.year}
				>
					<div class="flex items-center justify-between gap-2">
						<span class="font-medium">{m.partners_closed_title({ year: String(closed.year) })}</span
						>
						<LevelBadge level={closed.level} />
					</div>
					<span class="text-xs text-muted-foreground tabular-nums">
						{m.partners_closed_figures({
							revenue: formatEuros(closed.partnerRevenue),
							bonus: formatEuros(closed.bonusRevenue),
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
								class="text-xs text-muted-foreground"
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
		</section>
	{/if}

	{#if data.rules}
		<ClientProgramme rules={data.rules} />
	{/if}
{/if}
