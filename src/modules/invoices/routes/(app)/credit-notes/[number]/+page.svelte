<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RouteParams } from "$app/types";
	import BanIcon from "@lucide/svelte/icons/ban";
	import CircleCheckBigIcon from "@lucide/svelte/icons/circle-check-big";
	import FileDownIcon from "@lucide/svelte/icons/file-down";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import SendIcon from "@lucide/svelte/icons/send";

	import ActivityCard from "#lib/components/activity/activity-card.svelte";
	import DetailItem from "#lib/components/detail-item.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatCents, formatDate, formatDateTime } from "#lib/i18n/index.ts";
	import { isMadeElsewhere } from "#modules/invoices/credit-note.ts";
	import { getCreditNote } from "#modules/invoices/credit-notes.remote.ts";
	import ConfirmDialog from "#modules/invoices/detail/confirm-dialog.svelte";
	import CreditNoteDocument from "#modules/invoices/detail/credit-note-document.svelte";
	import CreditNoteEditor from "#modules/invoices/detail/credit-note-editor.svelte";
	import {
		issueCreditNote,
		removeCreditLine,
		settleCreditNote,
		voidCreditNote,
	} from "#modules/invoices/detail/credit-note.remote.ts";
	import { canChange, isEditable } from "#modules/invoices/invoice.ts";
	import CreditStatusBadge from "#modules/invoices/ui/credit-status-badge.svelte";
	import InvoiceLink from "#modules/invoices/ui/invoice-link.svelte";

	let { params }: { params: RouteParams<"/(app)/(modules)/invoices/credit-notes/[number]"> } =
		$props();

	const data = $derived(await getCreditNote(params.number));
	const credit = $derived(data.creditNote);
	const editable = $derived(isEditable(credit.status));
	// Another module's keeps its lines (and reason); it's still issued, settled or voided here.
	const linesEditable = $derived(editable && !isMadeElsewhere(credit));
	// One against a sent invoice is settled when the invoice is paid, not by hand.
	const offset = $derived(credit.invoice?.status === "sent");
	const problems = $derived(
		credit.lines.flatMap((line) => removeCreditLine.for(String(line.id)).fields.allIssues() ?? []),
	);
</script>

<svelte:head>
	<title>{credit.number} · {m.invoices_credit_notes()}</title>
</svelte:head>

<div class="print:hidden">
	<PageHeader
		title={credit.number}
		description={m.invoices_credit_for({ customer: credit.customer.name })}
		breadcrumbs={[
			{ label: m.invoices_title(), href: resolve("/(app)/(modules)/invoices") },
			{
				label: m.invoices_credit_notes(),
				href: resolve("/(app)/(modules)/invoices/credit-notes"),
			},
			{ label: credit.number },
		]}
	>
		{#snippet badges()}
			<CreditStatusBadge state={credit.status} />
		{/snippet}
		{#snippet actions()}
			<Button variant="outline" onclick={() => window.print()}>
				<PrinterIcon data-icon="inline-start" />
				{m.invoices_print()}
			</Button>
			<Button
				variant="outline"
				href={resolve("/(app)/(modules)/invoices/credit-notes/[number]/pdf", {
					number: credit.number,
				})}
				download="{credit.number}.pdf"
				data-sveltekit-reload
			>
				<FileDownIcon data-icon="inline-start" />
				{m.invoices_download_pdf()}
			</Button>
			{#if canChange(credit.status, "void")}
				<ConfirmDialog
					form={voidCreditNote}
					id={String(credit.id)}
					label={m.invoices_credit_void()}
					icon={BanIcon}
					variant="destructive"
					title={m.invoices_void_title({ number: credit.number })}
					description={m.invoices_credit_void_description()}
					done={m.invoices_credit_voided()}
				/>
			{/if}
			{#if canChange(credit.status, "paid") && !offset}
				<ConfirmDialog
					form={settleCreditNote}
					id={String(credit.id)}
					label={m.invoices_credit_settle()}
					icon={CircleCheckBigIcon}
					title={m.invoices_credit_settle_title({ number: credit.number })}
					description={m.invoices_credit_settle_description({ customer: credit.customer.name })}
					done={m.invoices_credit_settled_done()}
				/>
			{/if}
			{#if canChange(credit.status, "sent")}
				<ConfirmDialog
					form={issueCreditNote}
					id={String(credit.id)}
					label={m.invoices_issue()}
					icon={SendIcon}
					title={m.invoices_issue_title({ number: credit.number })}
					description={offset
						? m.invoices_credit_issue_offset_description({ number: credit.invoice!.number })
						: m.invoices_credit_issue_description()}
					done={m.invoices_credit_issued()}
				/>
			{/if}
		{/snippet}
	</PageHeader>
</div>

<Field.FieldError errors={problems} class="print:hidden" />

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="min-w-0 lg:col-span-2 print:col-span-3">
		<CreditNoteDocument {data} editable={linesEditable} />
	</div>

	<div class="flex min-w-0 flex-col gap-6 print:hidden">
		{#if credit.invoice && data.remaining !== null}
			<Card.Root data-credited-invoice>
				<Card.Header>
					<Card.Title>{m.invoices_column_invoice()}</Card.Title>
					<Card.Description>
						{#if credit.status === "sent" && offset}
							{m.invoices_credit_offset_pending()}
						{:else if credit.status === "sent"}
							{m.invoices_credit_to_refund({
								customer: credit.customer.name,
								amount: formatCents(-data.totals.total),
							})}
						{:else}
							{m.invoices_credit_against_description()}
						{/if}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<dl class="grid grid-cols-2 gap-4">
						<DetailItem label={m.invoices_column_invoice()}>
							<InvoiceLink number={credit.invoice.number} />
						</DetailItem>
						<DetailItem label={m.invoices_credit_remaining()}>
							<span class="tabular-nums" data-remaining>{formatCents(data.remaining)}</span>
						</DetailItem>
					</dl>
				</Card.Content>
			</Card.Root>
		{:else if credit.status === "sent"}
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.invoices_credit_settle()}</Card.Title>
					<Card.Description>
						{m.invoices_credit_to_refund({
							customer: credit.customer.name,
							amount: formatCents(-data.totals.total),
						})}
					</Card.Description>
				</Card.Header>
			</Card.Root>
		{/if}
		{#if editable}
			<CreditNoteEditor {credit} />
		{:else}
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.invoices_history()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<dl class="grid grid-cols-2 gap-4">
						<DetailItem label={m.invoices_column_created()} value={formatDate(credit.createdAt)} />
						<DetailItem
							label={m.invoices_column_issued()}
							value={credit.issuedOn && formatDate(credit.issuedOn)}
						/>
						<DetailItem
							label={m.invoices_enum_credit_note_state_paid()}
							value={credit.settledOn && formatDate(credit.settledOn)}
						/>
						{#if credit.voidedAt}
							<DetailItem label={m.invoices_voided_at()} value={formatDateTime(credit.voidedAt)} />
						{/if}
					</dl>
				</Card.Content>
			</Card.Root>
		{/if}
		<ActivityCard type="credit_note" id={credit.id} />
	</div>
</div>

<style>
	/* Print only the credit note itself, without the app around it. */
	@media print {
		:global([data-slot="sidebar"], [data-slot="app-header"], [data-sonner-toaster]) {
			display: none !important;
		}
	}
</style>
