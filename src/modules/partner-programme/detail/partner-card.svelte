<!--
	@component
	A partner's card on its customer's page: this year's level, Partner Omzet and Bonus Omzet so far,
	the way to the next level and the bonus it would bring (not to spend before the year closes), its
	closed years with the choice between cash and credit, and its wallet.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import DetailItem from "#lib/components/detail-item.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";

	import { formatEuros } from "../display.ts";
	import { partnerLabels } from "../labels.ts";
	import { closePartnerYear, type getPartnerCard } from "../partners.remote.ts";
	import LevelBadge from "../ui/level-badge.svelte";
	import LevelProgress from "../ui/level-progress.svelte";
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
			<Card.Action><LevelBadge level={figures.level?.level ?? null} /></Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		{#if figures}
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
				<form {...close.enhance(async ({ submit }) => void (await submit()))}>
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
					<LevelBadge level={closed.level} />
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

		<section class="flex flex-col gap-3" data-wallet>
			<div class="flex items-center justify-between gap-2">
				<h3 class="text-sm font-medium">{m.partners_wallet_title()}</h3>
				{#if card.canManage}
					<WalletEntryDialog code={card.customer.code} validUntil={card.validUntil} />
				{/if}
			</div>
			<dl class="grid grid-cols-2 gap-4">
				<DetailItem label={m.partners_wallet_awarded()}>
					<span class="tabular-nums" data-wallet-awarded>{formatCents(wallet.awarded)}</span>
				</DetailItem>
				<DetailItem label={m.partners_wallet_spent()}>
					<span class="tabular-nums" data-wallet-spent>
						{wallet.spent ? `– ${formatCents(wallet.spent)}` : formatCents(0)}
					</span>
				</DetailItem>
				<DetailItem label={m.partners_wallet_available()}>
					<span class="font-semibold tabular-nums" data-wallet-available>
						{formatCents(wallet.available)}
					</span>
				</DetailItem>
				<DetailItem
					label={m.partners_wallet_valid_until()}
					value={wallet.validUntil ? formatDate(wallet.validUntil) : null}
				/>
			</dl>
			{#if wallet.entries.length}
				<ul class="flex flex-col divide-y text-sm">
					{#each wallet.entries as entry (entry.id)}
						<li class="flex items-baseline justify-between gap-3 py-1.5">
							<span class="min-w-0">
								<span class="font-medium">{partnerLabels.label("walletEntryKind", entry.kind)}</span
								>
								{#if entry.note}
									<span class="text-muted-foreground"> · {entry.note}</span>
								{/if}
							</span>
							<span class="shrink-0 tabular-nums">{formatCents(entry.amount)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground">{m.partners_wallet_empty()}</p>
			{/if}
			<p class="text-xs text-muted-foreground">{m.partners_wallet_separate()}</p>
		</section>
	</Card.Content>
</Card.Root>
