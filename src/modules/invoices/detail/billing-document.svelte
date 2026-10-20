<!--
	@component
	An invoice or credit note as the customer gets it, laid out from `documentView()` like its PDF:
	who it's from and for, its dates, lines and totals, and what it says besides. While its lines can
	change (`editable`), each can be removed; an invoice's order's lines (its price and adjustments)
	go together, from its first.
-->
<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";

	import { formatCents, formatNumber } from "#lib/i18n/index.ts";
	import { OrderLink } from "#lib/orders/components.ts";

	import { type BillingDocument, type DocumentLine, documentView } from "../document.ts";
	import InvoiceLink from "../ui/invoice-link.svelte";
	import { removeLine } from "./draft.remote.ts";

	type Line = DocumentLine & {
		id: number;
		orderId: number | null;
		order: { number: string } | null;
	};

	let { doc, editable }: { doc: BillingDocument<Line>; editable: boolean } = $props();

	const view = $derived(documentView(doc));
	const customer = $derived(doc.customer);
	const removable = $derived(
		new Set(
			doc.lines
				.filter(
					(line, i) =>
						doc.kind === "creditNote" ||
						!line.orderId ||
						doc.lines.findIndex((l) => l.orderId === line.orderId) === i,
				)
				.map((line) => line.id),
		),
	);
	const removeOf = (line: Line) => removeLine.for(`${doc.kind}-${line.id}`);
	const issues = $derived(doc.lines.flatMap((line) => removeOf(line).fields.allIssues() ?? []));
</script>

<Card.Root>
	<Card.Header class="gap-6 sm:grid-cols-[1fr_auto]">
		<div class="flex flex-col gap-1">
			<p class="text-lg font-semibold">{doc.organization}</p>
			<p class="text-sm text-muted-foreground">{view.title}</p>
		</div>
		<dl class="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm sm:justify-self-end">
			{#each view.dates as { label, value, invoice } (label)}
				<dt class="text-muted-foreground">{label}</dt>
				<dd class="tabular-nums">
					{#if invoice}<InvoiceLink number={value} />{:else}{value}{/if}
				</dd>
			{/each}
		</dl>
	</Card.Header>
	<Card.Content class="flex flex-col gap-6">
		<Field.FieldError errors={issues} class="print:hidden" />
		<div class="flex flex-col gap-0.5 text-sm">
			<p class="text-xs text-muted-foreground">{m.invoices_bill_to()}</p>
			<p class="font-medium">{customer.name}</p>
			<p>{m.invoices_attention({ name: customer.contactName })}</p>
			<p>{customer.city}, {customer.country}</p>
			<p class="text-muted-foreground">
				{customer.email} · {m.invoices_customer_code({ code: customer.code })}
			</p>
		</div>

		{#if view.reason}
			<p class="text-sm" data-credit-reason>{view.reason}</p>
		{/if}

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
				{#each doc.lines as line (line.id)}
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
								{#if removable.has(line.id)}
									{@const remove = removeOf(line)}
									<form {...remove}>
										<input {...remove.fields.kind.as("hidden", doc.kind)} />
										<input {...remove.fields.id.as("hidden", String(line.id))} />
										<Button
											type="submit"
											variant="ghost"
											size="icon-sm"
											aria-label={m.invoices_remove_line()}
											title={doc.kind === "invoice" && line.orderId
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
				{#each view.totals as { label, value, total } (label)}
					<Table.Row class={total && "font-semibold"}>
						<Table.Cell colspan={3}>{label}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatCents(value)}</Table.Cell>
						{#if editable}<Table.Cell></Table.Cell>{/if}
					</Table.Row>
				{/each}
			</Table.Footer>
		</Table.Root>

		{#each view.closing as paragraph, i (i)}
			<p class="text-sm whitespace-pre-line text-muted-foreground">{paragraph}</p>
		{/each}
	</Card.Content>
</Card.Root>
