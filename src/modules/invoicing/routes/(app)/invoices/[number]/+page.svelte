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
	import { formatDate, formatDateTime } from "#lib/i18n";

	import { canChange, isEditable } from "../../../../invoice.ts";
	import StatusBadge from "../../../../status-badge.svelte";
	import { issueInvoice, markPaid, voidInvoice } from "../invoice-status.remote.ts";
	import { getInvoice } from "../invoices.remote.ts";
	import ConfirmDialog from "./confirm-dialog.svelte";
	import DraftEditor from "./draft-editor.svelte";
	import { removeLine } from "./draft.remote.ts";
	import InvoiceDocument from "./invoice-document.svelte";

	let { params }: { params: RouteParams<"/(app)/invoices/[number]"> } = $props();

	const data = $derived(await getInvoice(params.number));
	const invoice = $derived(data.invoice);
	const editable = $derived(isEditable(invoice.status));
	const problems = $derived(
		invoice.lines.flatMap((line) => removeLine.for(String(line.id)).fields.allIssues() ?? []),
	);
</script>

<svelte:head>
	<title>{invoice.number} · {m.invoices_title()}</title>
</svelte:head>

<div class="print:hidden">
	<PageHeader
		title={invoice.number}
		description={m.invoices_for({ customer: invoice.customer.name })}
		breadcrumbs={[
			{ label: m.invoices_title(), href: resolve("/(app)/invoices") },
			{ label: invoice.number },
		]}
	>
		{#snippet badges()}
			<StatusBadge state={invoice.state} />
		{/snippet}
		{#snippet actions()}
			<Button variant="outline" onclick={() => window.print()}>
				<PrinterIcon data-icon="inline-start" />
				{m.invoices_print()}
			</Button>
			<Button
				variant="outline"
				href={resolve("/(app)/invoices/[number]/pdf", { number: invoice.number })}
				download="{invoice.number}.pdf"
				data-sveltekit-reload
			>
				<FileDownIcon data-icon="inline-start" />
				{m.invoices_download_pdf()}
			</Button>
			{#if canChange(invoice.status, "void")}
				<ConfirmDialog
					form={voidInvoice}
					id={String(invoice.id)}
					label={m.invoices_void()}
					icon={BanIcon}
					variant="destructive"
					title={m.invoices_void_title({ number: invoice.number })}
					description={invoice.status === "draft"
						? m.invoices_void_draft_description()
						: m.invoices_void_sent_description()}
					done={m.invoices_voided()}
				/>
			{/if}
			{#if canChange(invoice.status, "paid")}
				<ConfirmDialog
					form={markPaid}
					id={String(invoice.id)}
					label={m.invoices_mark_paid()}
					icon={CircleCheckBigIcon}
					title={m.invoices_mark_paid_title({ number: invoice.number })}
					description={m.invoices_mark_paid_description({ customer: invoice.customer.name })}
					done={m.invoices_marked_paid()}
				/>
			{/if}
			{#if canChange(invoice.status, "sent")}
				<ConfirmDialog
					form={issueInvoice}
					id={String(invoice.id)}
					label={m.invoices_issue()}
					icon={SendIcon}
					title={m.invoices_issue_title({ number: invoice.number })}
					description={m.invoices_issue_description()}
					done={m.invoices_issued()}
				/>
			{/if}
		{/snippet}
	</PageHeader>
</div>

<Field.FieldError errors={problems} class="print:hidden" />

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="min-w-0 lg:col-span-2 print:col-span-3">
		<InvoiceDocument {data} {editable} />
	</div>

	<div class="flex min-w-0 flex-col gap-6 print:hidden">
		{#if editable}
			<DraftEditor {invoice} />
		{:else}
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.invoices_history()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<dl class="grid grid-cols-2 gap-4">
						<DetailItem label={m.invoices_column_created()} value={formatDate(invoice.createdAt)} />
						<DetailItem
							label={m.invoices_column_issued()}
							value={invoice.issuedOn && formatDate(invoice.issuedOn)}
						/>
						<DetailItem
							label={m.invoices_column_due()}
							value={invoice.dueOn && formatDate(invoice.dueOn)}
						/>
						<DetailItem
							label={m.invoices_payment_term()}
							value={m.invoices_days({ count: invoice.paymentTermDays })}
						/>
						<DetailItem
							label={m.invoices_paid()}
							value={invoice.paidOn && formatDate(invoice.paidOn)}
						/>
						{#if invoice.voidedAt}
							<DetailItem label={m.invoices_voided_at()} value={formatDateTime(invoice.voidedAt)} />
						{/if}
					</dl>
				</Card.Content>
			</Card.Root>
		{/if}
		<ActivityCard type="invoice" id={invoice.id} />
	</div>
</div>

<style>
	/* Print only the invoice itself, without the app around it. */
	@media print {
		:global([data-slot="sidebar"], [data-slot="app-header"], [data-sonner-toaster]) {
			display: none !important;
		}
	}
</style>
