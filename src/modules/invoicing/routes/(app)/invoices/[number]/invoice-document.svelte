<!--
	@component
	An invoice as the customer gets it: who it's from and for, its dates, lines and totals; what the
	PDF shows too. On a draft (`editable`), each order, item or typed-in line can be removed.
-->
<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";

	import { formatCents, formatDate, formatNumber } from "#lib/i18n";
	import { OrderLink } from "#lib/orders/components";

	import { formatRate } from "../../../../display.ts";
	import type { getInvoice } from "../invoices.remote.ts";
	import { removeLine } from "./draft.remote.ts";

	let { data, editable }: { data: Awaited<ReturnType<typeof getInvoice>>; editable: boolean } =
		$props();

	const invoice = $derived(data.invoice);
	const customer = $derived(data.invoice.customer);
	// An order's lines (its price and adjustments) are removed together, from its first line.
	const removable = $derived(
		new Set(
			invoice.lines
				.filter(
					(line, i) =>
						!line.orderId || invoice.lines.findIndex((l) => l.orderId === line.orderId) === i,
				)
				.map((line) => line.id),
		),
	);
</script>

<Card.Root>
	<Card.Header class="gap-6 sm:grid-cols-[1fr_auto]">
		<div class="flex flex-col gap-1">
			<p class="text-lg font-semibold">{data.organization}</p>
			<p class="text-sm text-muted-foreground">
				{m.invoices_invoice_number({ number: invoice.number })}
			</p>
		</div>
		<dl class="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm sm:justify-self-end">
			<dt class="text-muted-foreground">{m.invoices_column_issued()}</dt>
			<dd class="tabular-nums">
				{invoice.issuedOn ? formatDate(invoice.issuedOn) : m.invoices_not_yet()}
			</dd>
			<dt class="text-muted-foreground">{m.invoices_column_due()}</dt>
			<dd class="tabular-nums">
				{invoice.dueOn
					? formatDate(invoice.dueOn)
					: m.invoices_due_after_issuing({ count: invoice.paymentTermDays })}
			</dd>
			{#if invoice.paidOn}
				<dt class="text-muted-foreground">{m.invoices_paid()}</dt>
				<dd class="tabular-nums">{formatDate(invoice.paidOn)}</dd>
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
				{#each invoice.lines as line (line.id)}
					<Table.Row>
						<Table.Cell class="whitespace-normal">
							<div class="flex flex-col">
								<span>
									{#if line.order && removable.has(line.id)}
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
								{#if removable.has(line.id)}
									{@const remove = removeLine.for(String(line.id))}
									<form {...remove}>
										<input {...remove.fields.id.as("hidden", String(line.id))} />
										<Button
											type="submit"
											variant="ghost"
											size="icon-sm"
											aria-label={m.invoices_remove_line()}
											title={line.orderId
												? m.invoices_remove_order_lines()
												: m.invoices_remove_line()}
											disabled={!!remove.pending}
										>
											<XIcon />
										</Button>
									</form>
								{/if}
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
					<Table.Cell colspan={3}
						>{m.invoices_vat({ rate: formatRate(invoice.vatRate) })}</Table.Cell
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

		{#if invoice.notes}
			<p class="text-sm whitespace-pre-line text-muted-foreground">{invoice.notes}</p>
		{/if}
		{#if invoice.dueOn && invoice.status !== "void"}
			<p class="text-sm text-muted-foreground">
				{m.invoices_please_pay({
					amount: formatCents(data.totals.total),
					date: formatDate(invoice.dueOn),
					number: invoice.number,
				})}
			</p>
		{/if}
	</Card.Content>
</Card.Root>
