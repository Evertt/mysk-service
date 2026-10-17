<!--
	@component
	The partner's SHLTR Wallet in the customer portal, as the mockup's dark panel: the credit awarded
	that's still valid, what's spent of it, what's available now and until when, and (with
	`entries`) its latest entries; under it what the tenant's modules offer to do with the credit
	(`partner-programme.client.wallet`, e.g. the parts shop).
-->
<script lang="ts">
	import CreditCardIcon from "@lucide/svelte/icons/credit-card";
	import WalletCardsIcon from "@lucide/svelte/icons/wallet-cards";

	import DarkPanel, { type DarkPanelLine } from "#lib/components/dark-panel.svelte";
	import ExtensionSlot from "#lib/extensions/extension-slot.svelte";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";

	import { clientWallet } from "../api/extensions.ts";
	import { partnerLabels } from "../labels.ts";
	import type { WalletEntryKind } from "../model.ts";

	interface Wallet {
		awarded: number;
		spent: number;
		available: number;
		validUntil: Temporal.PlainDate | null;
		entries: {
			id: number;
			kind: WalletEntryKind;
			amount: number;
			note: string | null;
			createdAt: Temporal.Instant;
		}[];
	}

	let { wallet, entries = false }: { wallet: Wallet; entries?: boolean } = $props();

	const lines = $derived<DarkPanelLine[]>([
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
			attributes: { "data-wallet-valid-until": "" },
		},
	]);
</script>

<DarkPanel
	title={m.partners_client_wallet_title()}
	eyebrow={m.partners_form_credit()}
	icon={WalletCardsIcon}
	{lines}
	data-client-wallet
>
	{#if entries}
		{#if wallet.entries.length}
			<ul class="flex flex-col divide-y divide-current/15 text-sm" data-wallet-entries>
				{#each wallet.entries as entry (entry.id)}
					<li class="flex items-baseline justify-between gap-3 py-2" data-wallet-entry={entry.kind}>
						<span class="flex min-w-0 flex-col">
							<span class="font-medium">{partnerLabels.label("walletEntryKind", entry.kind)}</span>
							<span class="text-xs opacity-65">
								{formatDate(entry.createdAt)}{entry.note ? ` · ${entry.note}` : ""}
							</span>
						</span>
						<span class="shrink-0 tabular-nums">{formatCents(entry.amount)}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm opacity-65">{m.partners_wallet_empty()}</p>
		{/if}
	{/if}
	<ExtensionSlot point={clientWallet} props={{ available: wallet.available }} />
	<p class="flex items-start gap-2 text-xs opacity-65">
		<CreditCardIcon class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
		{m.partners_wallet_separate()}
	</p>
</DarkPanel>
