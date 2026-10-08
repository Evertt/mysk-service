<!--
	@component
	The invoicing module's cards on the dashboard (the `dashboard` slot in `#lib/modules.ts`): what
	customers owe and how much of it is overdue, and the most overdue invoices.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatCents, formatDate } from "#lib/format.ts";

	import InvoiceLink from "./invoice-link.svelte";
	import { getReceivables } from "./invoicing.remote.ts";

	const data = $derived(await getReceivables());
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.invoices_receivables()}</Card.Title>
		<Card.Description>{m.invoices_receivables_description()}</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" href={resolve("/(app)/invoices")}
				>{m.invoices_all()}</Button
			>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<dl class="grid grid-cols-2 gap-4">
			<div class="flex flex-col gap-1">
				<dt class="text-sm text-muted-foreground">{m.invoices_outstanding()}</dt>
				<dd class="text-3xl font-semibold tabular-nums">
					{formatCents(data.outstanding.total)}
				</dd>
				<dd class="text-sm text-muted-foreground">
					{m.invoices_count({ count: data.outstanding.count })}
				</dd>
			</div>
			<div class="flex flex-col gap-1">
				<dt class="text-sm text-muted-foreground">{m.invoices_overdue()}</dt>
				<dd
					class={[
						"text-3xl font-semibold tabular-nums",
						data.overdue.count > 0 && "text-destructive",
					]}
				>
					{formatCents(data.overdue.total)}
				</dd>
				<dd class="text-sm text-muted-foreground">
					{m.invoices_count({ count: data.overdue.count })}
				</dd>
			</div>
		</dl>
	</Card.Content>
	<Card.Footer class="text-sm text-muted-foreground">
		{m.invoices_drafts_waiting({ count: data.drafts })}
	</Card.Footer>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.invoices_overdue_title()}</Card.Title>
		<Card.Description>{m.invoices_overdue_description()}</Card.Description>
		{#if data.overdue.count}
			<Card.Action>
				<Button variant="outline" size="sm" href="{resolve('/(app)/invoices')}?status=overdue">
					{m.invoices_view_all()}
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if data.overdueInvoices.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{m.invoices_column_invoice()}</Table.Head>
						<Table.Head>{m.invoices_column_due()}</Table.Head>
						<Table.Head class="text-right">{m.invoices_column_total()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.overdueInvoices as invoice (invoice.id)}
						<Table.Row>
							<Table.Cell>
								<div class="flex flex-col">
									<InvoiceLink number={invoice.number} />
									<span class="max-w-56 truncate text-xs text-muted-foreground">
										{invoice.customer.name}
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="tabular-nums">
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
