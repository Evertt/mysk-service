<!--
	@component
	An issued invoice's credit notes on its page: each with its status and total, what they took off
	and what's left to pay, and a way to credit it (some or all of it) while anything is left.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import ReceiptTextIcon from "@lucide/svelte/icons/receipt-text";

	import DetailItem from "#lib/components/detail-item.svelte";
	import EnumBadge from "#lib/components/enum-badge.svelte";
	import { formatCents } from "#lib/i18n/index.ts";

	import { canCredit } from "../credit-note.ts";
	import { creditNoteStateDisplay } from "../display.ts";
	import type { getInvoice } from "../invoices.remote.ts";
	import CreditNoteLink from "../ui/credit-note-link.svelte";

	let { data }: { data: Awaited<ReturnType<typeof getInvoice>> } = $props();

	const invoice = $derived(data.invoice);
	const credits = $derived(data.credits);
</script>

<Card.Root data-invoice-credits>
	<Card.Header>
		<Card.Title>{m.invoices_credit_notes()}</Card.Title>
		<Card.Description>
			{credits.notes.length ? m.invoices_credit_card_description() : m.invoices_credit_none()}
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#if credits.notes.length}
			<ul class="flex flex-col divide-y text-sm">
				{#each credits.notes as note (note.id)}
					<li class="flex items-center justify-between gap-3 py-1.5" data-credit-note={note.number}>
						<span class="flex items-center gap-2">
							<CreditNoteLink number={note.number} />
							<EnumBadge display={creditNoteStateDisplay} value={note.status} />
						</span>
						<span class="tabular-nums">{formatCents(note.total)}</span>
					</li>
				{/each}
			</ul>
			<dl class="grid grid-cols-2 gap-4">
				<DetailItem label={m.invoices_credit_credited()}>
					<span class="tabular-nums" data-credited>{formatCents(credits.credited)}</span>
				</DetailItem>
				<DetailItem label={m.invoices_credit_remaining()}>
					<span class="font-semibold tabular-nums" data-remaining>
						{formatCents(credits.remaining)}
					</span>
				</DetailItem>
			</dl>
		{/if}
		{#if canCredit(invoice.status) && credits.creditable > 0}
			<Button
				variant="outline"
				class="w-fit"
				href={resolve("/(app)/(modules)/invoices/[number]/credit", { number: invoice.number })}
			>
				<ReceiptTextIcon data-icon="inline-start" />
				{m.invoices_credit_create()}
			</Button>
		{/if}
	</Card.Content>
</Card.Root>
