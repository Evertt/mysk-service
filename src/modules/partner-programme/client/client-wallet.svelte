<!--
	@component
	The partner's SHLTR Wallet in the customer portal: the credit awarded that's still valid, what's
	spent of it, what's available now and until when, and (with `entries`) its latest entries; under
	it what the tenant's modules offer to do with the credit (`partner-programme.client.wallet`, e.g.
	the parts shop).
-->
<script lang="ts">
	import DetailItem from "#lib/components/detail-item.svelte";
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
</script>

<Card.Root data-client-wallet>
	<Card.Header>
		<Card.Title>{m.partners_client_wallet_title()}</Card.Title>
		<Card.Description>{m.partners_client_wallet_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
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
				<span class="text-lg font-semibold tabular-nums" data-wallet-available>
					{formatCents(wallet.available)}
				</span>
			</DetailItem>
			<DetailItem
				label={m.partners_wallet_valid_until()}
				value={wallet.validUntil ? formatDate(wallet.validUntil) : null}
			/>
		</dl>
		{#if entries}
			{#if wallet.entries.length}
				<ul class="flex flex-col divide-y text-sm" data-wallet-entries>
					{#each wallet.entries as entry (entry.id)}
						<li
							class="flex items-baseline justify-between gap-3 py-2"
							data-wallet-entry={entry.kind}
						>
							<span class="flex min-w-0 flex-col">
								<span class="font-medium">{partnerLabels.label("walletEntryKind", entry.kind)}</span
								>
								<span class="text-xs text-muted-foreground">
									{formatDate(entry.createdAt)}{entry.note ? ` · ${entry.note}` : ""}
								</span>
							</span>
							<span class="shrink-0 tabular-nums">{formatCents(entry.amount)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground">{m.partners_wallet_empty()}</p>
			{/if}
		{/if}
		<p class="text-xs text-muted-foreground">{m.partners_wallet_separate()}</p>
		<ExtensionSlot point={clientWallet} props={{ available: wallet.available }} />
	</Card.Content>
</Card.Root>
