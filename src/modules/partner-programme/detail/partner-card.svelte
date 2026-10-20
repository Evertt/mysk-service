<!--
	@component
	A partner's card on its customer's page: this year's level, Partner Omzet and Bonus Omzet so far,
	the way to the next level and the bonus it would bring (not to spend before the year closes), its
	closed years with the choice between cash and credit (cash paid out as a credit note), and its
	wallet. The revenue as key figures, the wallet as the SHLTR mockup's dark panel.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import WalletCardsIcon from "@lucide/svelte/icons/wallet-cards";

	import DarkPanel from "#lib/components/dark-panel.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import KeyFigure from "#lib/components/key-figure.svelte";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";

	import { formatEuros } from "../display.ts";
	import { partnerLabels } from "../labels.ts";
	import { closePartnerYear, type getPartnerCard } from "../partners.remote.ts";
	import LevelBadge from "../ui/level-badge.svelte";
	import LevelProgress from "../ui/level-progress.svelte";
	import BonusCreditNote from "./bonus-credit-note.svelte";
	import ChoiceDialog from "./choice-dialog.svelte";
	import WalletEntryDialog from "./wallet-entry-dialog.svelte";

	/** A partner's card: the customer is one. */
	type PartnerCardData = Extract<Awaited<ReturnType<typeof getPartnerCard>>, { year: number }>;

	let { card }: { card: PartnerCardData } = $props();

	const figures = $derived(card.figures);
	const wallet = $derived(card.wallet);
	const close = $derived(closePartnerYear.for(card.customer.code));
	const sameBonusRevenue = $derived(
		!figures || figures.bonusRevenue.cash === figures.bonusRevenue.credit,
	);
</script>

<Card.Root data-partner-card>
	<Card.Header>
		<Card.Title>{m.partners_card_title({ year: String(card.year) })}</Card.Title>
		<Card.Description>
			{card.partner.acceptedBy
				? m.partners_card_since({
						date: formatDate(card.partner.acceptedOn),
						name: card.partner.acceptedBy,
					})
				: m.partners_card_since_date({ date: formatDate(card.partner.acceptedOn) })}
		</Card.Description>
		{#if figures}
			<Card.Action
				><LevelBadge
					level={figures.level?.level ?? null}
					colour={figures.level?.colour}
				/></Card.Action
			>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		{#if figures}
			<dl class="grid grid-cols-2 gap-3">
				<KeyFigure label={m.partners_partner_revenue()}>
					<span data-partner-revenue>{formatEuros(figures.partnerRevenue)}</span>
				</KeyFigure>
				<KeyFigure
					label={sameBonusRevenue ? m.partners_bonus_revenue() : m.partners_bonus_revenue_cash()}
				>
					<span data-bonus-revenue>{formatEuros(figures.bonusRevenue.cash)}</span>
				</KeyFigure>
				{#if !sameBonusRevenue}
					<KeyFigure label={m.partners_bonus_revenue_credit()} class="col-span-2">
						{formatEuros(figures.bonusRevenue.credit)}
					</KeyFigure>
				{/if}
			</dl>

			<LevelProgress revenue={figures.partnerRevenue} progress={figures.progress} />

			<dl class="grid grid-cols-2 gap-4">
				<DetailItem label={m.partners_expected_cash()}>
					<span class="font-medium tabular-nums" data-expected-cash>
						{formatCents(figures.bonus.cash)}
					</span>
				</DetailItem>
				<DetailItem label={m.partners_expected_credit()}>
					<span class="font-medium tabular-nums" data-expected-credit>
						{formatCents(figures.bonus.credit)}
					</span>
				</DetailItem>
			</dl>
			<p class="-mt-4 text-xs text-muted-foreground">{m.partners_not_yet_spendable()}</p>
		{:else}
			<p class="text-sm text-muted-foreground">
				{m.partners_no_rules({ year: String(card.year) })}
				<a
					class="underline-offset-4 hover:underline"
					href={resolve("/(app)/(modules)/partner-programme/years")}
				>
					{m.partners_rules_link()}
				</a>
			</p>
		{/if}

		{#if card.closable !== null}
			<div class="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
				<span class="text-sm">{m.partners_close_waiting({ year: String(card.closable) })}</span>
				<form {...close.enhance(async ({ submit }) => void (await submitted(submit)))}>
					<input {...close.fields.code.as("hidden", card.customer.code)} />
					<input {...close.fields.year.as("hidden", String(card.closable))} />
					<SubmitButton size="sm" variant="outline" pending={close.pending}>
						{m.partners_close_partner({ year: String(card.closable) })}
					</SubmitButton>
				</form>
				<Field.FieldError errors={close.fields.allIssues()} class="w-full" />
			</div>
		{/if}

		{#each card.closed as closed (closed.id)}
			<section class="flex flex-col gap-2 rounded-md border p-3" data-closed-year={closed.year}>
				<div class="flex items-center justify-between gap-2">
					<h3 class="text-sm font-medium">
						{m.partners_closed_title({ year: String(closed.year) })}
					</h3>
					<LevelBadge level={closed.level} colour={closed.colour} />
				</div>
				<p class="text-xs text-muted-foreground tabular-nums">
					{m.partners_closed_figures({
						revenue: formatEuros(closed.partnerRevenue),
						bonus: formatEuros(closed.bonusRevenueCash),
					})}
				</p>
				{#if closed.choice}
					<p class="text-sm" data-choice={closed.choice}>
						{m.partners_closed_chosen({
							form: partnerLabels.label("bonusForm", closed.choice),
							amount: formatCents(
								closed.choice === "cash" ? closed.cashAmount : closed.creditAmount,
							),
						})}
					</p>
					{#if closed.choice === "cash"}
						<BonusCreditNote
							code={card.customer.code}
							year={closed.year}
							creditNote={closed.creditNote}
							canManage={card.canManage}
						/>
					{/if}
				{:else if closed.cashAmount || closed.creditAmount}
					{#if card.canManage}
						<div class="flex flex-wrap gap-2">
							<ChoiceDialog
								code={card.customer.code}
								year={closed.year}
								choice="credit"
								amount={closed.creditAmount}
							/>
							<ChoiceDialog
								code={card.customer.code}
								year={closed.year}
								choice="cash"
								amount={closed.cashAmount}
							/>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">{m.partners_closed_waiting_choice()}</p>
					{/if}
				{:else}
					<p class="text-sm text-muted-foreground">{m.partners_closed_no_bonus()}</p>
				{/if}
			</section>
		{/each}

		<DarkPanel
			title={m.partners_wallet_title()}
			icon={WalletCardsIcon}
			class="p-4 sm:p-5"
			lines={[
				{
					label: m.partners_wallet_awarded(),
					value: formatCents(wallet.awarded),
					attributes: { "data-wallet-awarded": "" },
				},
				{
					label: m.partners_wallet_spent(),
					value: wallet.spent ? `– ${formatCents(wallet.spent)}` : formatCents(0),
					attributes: { "data-wallet-spent": "" },
				},
				{
					label: m.partners_wallet_available(),
					value: formatCents(wallet.available),
					strong: true,
					attributes: { "data-wallet-available": "" },
				},
				{
					label: m.partners_wallet_valid_until(),
					value: wallet.validUntil ? formatDate(wallet.validUntil) : "—",
				},
			]}
			data-wallet
		>
			{#if card.canManage}
				<div class="text-foreground">
					<WalletEntryDialog code={card.customer.code} validUntil={card.validUntil} />
				</div>
			{/if}
			{#if wallet.entries.length}
				<ul class="flex flex-col divide-y divide-current/15 text-sm">
					{#each wallet.entries as entry (entry.id)}
						<li class="flex items-baseline justify-between gap-3 py-1.5">
							<span class="min-w-0">
								<span class="font-medium">{partnerLabels.label("walletEntryKind", entry.kind)}</span
								>
								{#if entry.note}
									<span class="opacity-65"> · {entry.note}</span>
								{/if}
							</span>
							<span class="shrink-0 tabular-nums">{formatCents(entry.amount)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm opacity-65">{m.partners_wallet_empty()}</p>
			{/if}
			<p class="text-xs opacity-65">{m.partners_wallet_separate()}</p>
		</DarkPanel>
	</Card.Content>
</Card.Root>
