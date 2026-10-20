<!--
	@component
	A credit note as the customer gets it: who it's from and for, the invoice it credits, its reason,
	lines and totals (negative); what the PDF shows too. While its lines can change (`editable`: a
	draft's, unless another module made it), each line can be removed.
-->
<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";

	import { formatCents, formatDate, formatNumber } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import type { getCreditNote } from "../credit-notes.remote.ts";
	import { formatRate } from "../display.ts";
	import InvoiceLink from "../ui/invoice-link.svelte";
	import { removeCreditLine } from "./credit-note.remote.ts";

	let { data, editable }: { data: Awaited<ReturnType<typeof getCreditNote>>; editable: boolean } =
		$props();

	const credit = $derived(data.creditNote);
	const customer = $derived(data.creditNote.customer);
</script>

<Card.Root>
	<Card.Header class="gap-6 sm:grid-cols-[1fr_auto]">
		<div class="flex flex-col gap-1">
			<p class="text-lg font-semibold">{data.organization}</p>
			<p class="text-sm text-muted-foreground">
				{m.invoices_credit_number({ number: credit.number })}
			</p>
		</div>
		<dl class="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm sm:justify-self-end">
			<dt class="text-muted-foreground">{m.invoices_column_issued()}</dt>
			<dd class="tabular-nums">
				{credit.issuedOn ? formatDate(credit.issuedOn) : m.invoices_not_yet()}
			</dd>
			{#if credit.invoice}
				<dt class="text-muted-foreground">{m.invoices_credit_credits()}</dt>
				<dd><InvoiceLink number={credit.invoice.number} /></dd>
			{/if}
			{#if credit.settledOn}
				<dt class="text-muted-foreground">{m.invoices_enum_credit_note_state_paid()}</dt>
				<dd class="tabular-nums">{formatDate(credit.settledOn)}</dd>
			{/if}
		</dl>
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		<div class="flex flex-col gap-0.5 text-sm">
			<p class="text-xs text-muted-foreground">{m.invoices_bill_to()}</p>
			<p class="font-medium">{customer.name}</p>
			<p>{m.invoices_attention({ name: customer.contactName })}</p>
			<p>{customer.city}, {customer.country}</p>
			<p class="text-muted-foreground">
				{customer.email} · {m.invoices_customer_code({ code: customer.code })}
			</p>
		</div>

		<p class="text-sm" data-credit-reason>
			{m.invoices_credit_reason_line({ reason: credit.reason })}
		</p>

		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.invoices_description_column()}</Table.Head>
					<Table.Head class="text-right">{m.invoices_quantity()}</Table.Head>
					<Table.Head class="text-right">{m.invoices_unit_price()}</Table.Head>
					<Table.Head class="text-right">{m.invoices_amount()}</Table.Head>
					{#if editable}
						<Table.Head class="w-10"><span class="sr-only">{m.invoices_remove()}</span></Table.Head>
					{/if}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each credit.lines as line (line.id)}
					<Table.Row>
						<Table.Cell class="whitespace-normal">
							<div class="flex flex-col">
								<span>
									{#if line.order && line.description.startsWith(line.order.number)}
										<OrderLink number={line.order.number} />{line.description.slice(
											line.order.number.length,
										)}
									{:else}
										{line.description}
									{/if}
								</span>
								{#if line.detail}
									<span class="text-xs text-muted-foreground">{line.detail}</span>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatNumber(line.quantity)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatCents(line.unitPrice)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatCents(line.amount)}</Table.Cell>
						{#if editable}
							<Table.Cell class="text-right">
								{@const remove = removeCreditLine.for(String(line.id))}
								<form {...remove}>
									<input {...remove.fields.id.as("hidden", String(line.id))} />
									<Button
										type="submit"
										variant="ghost"
										size="icon-sm"
										aria-label={m.invoices_remove_line()}
										title={m.invoices_remove_line()}
										disabled={!!remove.pending}
									>
										<XIcon />
									</Button>
								</form>
							</Table.Cell>
						{/if}
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={editable ? 5 : 4} class="text-center text-muted-foreground">
							{m.invoices_nothing_yet()}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
			<Table.Footer>
				<Table.Row>
					<Table.Cell colspan={3}>{m.invoices_subtotal()}</Table.Cell>
					<Table.Cell class="text-right tabular-nums"
						>{formatCents(data.totals.subtotal)}</Table.Cell
					>
					{#if editable}<Table.Cell></Table.Cell>{/if}
				</Table.Row>
				<Table.Row>
					<Table.Cell colspan={3}>{m.invoices_vat({ rate: formatRate(credit.vatRate) })}</Table.Cell
					>
					<Table.Cell class="text-right tabular-nums">{formatCents(data.totals.vat)}</Table.Cell>
					{#if editable}<Table.Cell></Table.Cell>{/if}
				</Table.Row>
				<Table.Row class="font-semibold">
					<Table.Cell colspan={3}>{m.invoices_total()}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{formatCents(data.totals.total)}</Table.Cell>
					{#if editable}<Table.Cell></Table.Cell>{/if}
				</Table.Row>
			</Table.Footer>
		</Table.Root>

		{#if credit.status !== "void"}
			<p class="text-sm text-muted-foreground">
				{m.invoices_credit_closing({
					amount: formatCents(-data.totals.total),
					number: credit.number,
				})}
			</p>
		{/if}
	</Card.Content>
</Card.Root>
