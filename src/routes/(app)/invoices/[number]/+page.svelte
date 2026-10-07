<script lang="ts">
	import { resolve } from "$app/paths";
	import BanIcon from "@lucide/svelte/icons/ban";
	import CircleCheckBigIcon from "@lucide/svelte/icons/circle-check-big";
	import FileDownIcon from "@lucide/svelte/icons/file-down";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import SendIcon from "@lucide/svelte/icons/send";

	import DetailItem from "#lib/components/detail-item.svelte";
	import { canChange, isEditable } from "#lib/components/invoicing/invoice.js";
	import StatusBadge from "#lib/components/invoicing/status-badge.svelte";
	import PageHeader from "#lib/components/page-header.svelte";
	import { formatDate, formatDateTime } from "#lib/format.js";

	import {
		getInvoice,
		issueInvoice,
		markPaid,
		removeLine,
		voidInvoice,
	} from "../invoices.remote.js";
	import type { PageProps } from "./$types";
	import ConfirmDialog from "./confirm-dialog.svelte";
	import DraftEditor from "./draft-editor.svelte";
	import InvoiceDocument from "./invoice-document.svelte";

	let { params }: PageProps = $props();

	const data = $derived(await getInvoice(params.number));
	const invoice = $derived(data.invoice);
	const editable = $derived(isEditable(invoice.status));
	const problems = $derived(
		invoice.lines.flatMap((line) => removeLine.for(String(line.id)).fields.allIssues() ?? []),
	);
</script>

<svelte:head>
	<title>{invoice.number} · Invoices</title>
</svelte:head>

<div class="print:hidden">
	<PageHeader title={invoice.number} description="Invoice for {invoice.customer.name}">
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href={resolve("/(app)/invoices")}>Invoices</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					<Breadcrumb.Page>{invoice.number}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		{#snippet badges()}
			<StatusBadge state={invoice.state} />
		{/snippet}
		{#snippet actions()}
			<Button variant="outline" onclick={() => window.print()}>
				<PrinterIcon data-icon="inline-start" />
				Print
			</Button>
			<Button
				variant="outline"
				href={resolve("/(app)/invoices/[number]/pdf", { number: invoice.number })}
				download="{invoice.number}.pdf"
				data-sveltekit-reload
			>
				<FileDownIcon data-icon="inline-start" />
				Download PDF
			</Button>
			{#if canChange(invoice.status, "void")}
				<ConfirmDialog
					form={voidInvoice}
					id={String(invoice.id)}
					label="Void"
					icon={BanIcon}
					variant="destructive"
					title="Void {invoice.number}?"
					description={invoice.status === "draft"
						? "The draft is kept under its number but bills nothing; its orders and fees can go on another invoice."
						: "The invoice is kept under its number but no longer bills anything: its orders go back to completed, and its orders and fees can go on another invoice."}
					done="Invoice voided"
				/>
			{/if}
			{#if canChange(invoice.status, "paid")}
				<ConfirmDialog
					form={markPaid}
					id={String(invoice.id)}
					label="Mark paid"
					icon={CircleCheckBigIcon}
					title="Mark {invoice.number} paid?"
					description="Records that {invoice.customer.name} paid it today."
					done="Invoice marked paid"
				/>
			{/if}
			{#if canChange(invoice.status, "sent")}
				<ConfirmDialog
					form={issueInvoice}
					id={String(invoice.id)}
					label="Issue"
					icon={SendIcon}
					title="Issue {invoice.number}?"
					description="It's dated today and can't be changed afterwards; its orders become invoiced."
					done="Invoice issued"
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
					<Card.Title>History</Card.Title>
				</Card.Header>
				<Card.Content>
					<dl class="grid grid-cols-2 gap-4">
						<DetailItem label="Created" value={formatDate(invoice.createdAt)} />
						<DetailItem label="Issued" value={invoice.issuedOn && formatDate(invoice.issuedOn)} />
						<DetailItem label="Due" value={invoice.dueOn && formatDate(invoice.dueOn)} />
						<DetailItem label="Payment term" value="{invoice.paymentTermDays} days" />
						<DetailItem label="Paid" value={invoice.paidOn && formatDate(invoice.paidOn)} />
						{#if invoice.voidedAt}
							<DetailItem label="Voided" value={formatDateTime(invoice.voidedAt)} />
						{/if}
					</dl>
				</Card.Content>
			</Card.Root>
		{/if}
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
