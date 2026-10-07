<!--
	@component
	The invoicing module's cards on the dashboard (the `dashboard` slot in `#lib/modules.ts`): what
	customers owe and how much of it is overdue, and the most overdue invoices.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { formatCents, formatDate } from "#lib/format.js";

	import InvoiceLink from "./invoice-link.svelte";
	import { getReceivables } from "./invoicing.remote.js";

	const data = $derived(await getReceivables());
	const invoices = (n: number) => `${n} ${n === 1 ? "invoice" : "invoices"}`;
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Receivables</Card.Title>
		<Card.Description>What customers owe on invoices sent, including VAT.</Card.Description>
		<Card.Action>
			<Button variant="outline" size="sm" href={resolve("/(app)/invoices")}>All invoices</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<dl class="grid grid-cols-2 gap-4">
			<div class="flex flex-col gap-1">
				<dt class="text-sm text-muted-foreground">Outstanding</dt>
				<dd class="text-3xl font-semibold tabular-nums">
					{formatCents(data.outstanding.total)}
				</dd>
				<dd class="text-sm text-muted-foreground">{invoices(data.outstanding.count)}</dd>
			</div>
			<div class="flex flex-col gap-1">
				<dt class="text-sm text-muted-foreground">Overdue</dt>
				<dd
					class={[
						"text-3xl font-semibold tabular-nums",
						data.overdue.count > 0 && "text-destructive",
					]}
				>
					{formatCents(data.overdue.total)}
				</dd>
				<dd class="text-sm text-muted-foreground">{invoices(data.overdue.count)}</dd>
			</div>
		</dl>
	</Card.Content>
	<Card.Footer class="text-sm text-muted-foreground">
		{data.drafts}
		{data.drafts === 1 ? "draft" : "drafts"} waiting to be issued
	</Card.Footer>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Overdue invoices</Card.Title>
		<Card.Description>Sent and past their due date, most overdue first.</Card.Description>
		{#if data.overdue.count}
			<Card.Action>
				<Button variant="outline" size="sm" href="{resolve('/(app)/invoices')}?status=overdue">
					View all
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if data.overdueInvoices.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Invoice</Table.Head>
						<Table.Head>Due</Table.Head>
						<Table.Head class="text-right">Total</Table.Head>
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
					<Empty.Title>Nothing overdue</Empty.Title>
					<Empty.Description>Every sent invoice is still within its payment term.</Empty.Description
					>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
