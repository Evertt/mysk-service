<!--
	@component
	The invoices module's cards on the dashboard (`dashboard.cards`, `#lib/dashboard/extensions.ts`):
	what customers owe (less what's credited) and how much of it is overdue, what's to refund on
	credit notes, and the most overdue invoices.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { squeeze } from "#lib/components/squeeze.ts";
	import StatTile from "#lib/components/stat-tile.svelte";
	import { formatCents, formatDate } from "#lib/i18n/index.ts";

	import { getReceivables } from "../../invoices.remote.ts";
	import InvoiceLink from "../../ui/invoice-link.svelte";

	const data = $derived(await getReceivables());
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.invoices_receivables()}</Card.Title>
		<Card.Description>{m.invoices_receivables_description()}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" href={resolve("/(app)/(modules)/invoices")}
				>{m.invoices_all()}</Button
			>
		</Card.Action>
	</Card.Header>
	<!-- The amounts side by side where they fit, else one above the other. -->
	<Card.Content class="@container">
		<div class="grid grid-cols-1 gap-4 @xs:grid-cols-2" data-receivables>
			<StatTile
				layout="figure"
				size="large"
				label={m.invoices_outstanding()}
				value={formatCents(data.outstanding.total)}
				detail={m.invoices_count({ count: data.outstanding.count })}
			/>
			<StatTile
				layout="figure"
				size="large"
				tone={data.overdue.count > 0 ? "danger" : "neutral"}
				label={m.invoices_overdue()}
				value={formatCents(data.overdue.total)}
				detail={m.invoices_count({ count: data.overdue.count })}
			/>
		</div>
	</Card.Content>
	<Card.Footer class="flex flex-col items-start gap-1 text-sm text-muted-foreground">
		<span>{m.invoices_drafts_waiting({ count: data.drafts })}</span>
		{#if data.refunds.count}
			<a
				data-refunds
				class="underline-offset-4 hover:underline"
				href="{resolve('/(app)/(modules)/invoices/credit-notes')}?settlement=refund"
			>
				{m.invoices_credit_refunds({
					count: data.refunds.count,
					amount: formatCents(data.refunds.total),
				})}
			</a>
		{/if}
	</Card.Footer>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.invoices_overdue_title()}</Card.Title>
		<Card.Description>{m.invoices_overdue_description()}</Card.Description>
		{#if data.overdue.count}
			<Card.Action>
				<Button
					variant="outline"
					size="sm"
					href="{resolve('/(app)/(modules)/invoices')}?status=overdue"
				>
					{m.invoices_view_all()}
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="@container">
		{#if data.overdueInvoices.length}
			<!-- A little tighter where the column is cramped, before it scrolls. -->
			<Table.Root {@attach squeeze({ within: "[data-slot=table-container]", min: 0.88 })}>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.invoices_column_invoice()}</Table.Head>
						<!-- Left out where the card is narrow (a phone): they're overdue, oldest first. -->
						<Table.Head class="hidden @xs:table-cell">{m.invoices_column_due()}</Table.Head>
						<Table.Head class="text-right">{m.invoices_column_total()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.overdueInvoices as invoice (invoice.id)}
						<Table.Row>
							<Table.Cell>
								<div class="flex flex-col">
									<InvoiceLink number={invoice.number} />
									<span class="w-0 min-w-full truncate text-xs text-muted-foreground">
										{invoice.customer.name}
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="hidden tabular-nums @xs:table-cell">
								{invoice.dueOn && formatDate(invoice.dueOn)}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{formatCents(invoice.total)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.invoices_nothing_overdue()}</Empty.Title>
					<Empty.Description>{m.invoices_nothing_overdue_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
