<!--
	@component
	The invoicing module's card on an order's page (the `order` slot in `#lib/modules.ts`): the
	invoice the order is on, or, once it's completed, a way to bill it. Nothing for a cancelled
	order that was never invoiced.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { formatDate } from "#lib/format.js";

	import InvoiceLink from "./invoice-link.svelte";
	import { getOrderInvoice } from "./invoicing.remote.js";
	import StatusBadge from "./status-badge.svelte";

	let { number }: { number: string } = $props();

	const data = $derived(await getOrderInvoice(number));
</script>

{#if data.invoice || data.status !== "cancelled"}
	<Card.Root>
		<Card.Header>
			<Card.Title>Invoice</Card.Title>
			<Card.Description>
				{#if data.invoice?.issuedOn}
					Invoiced on <InvoiceLink number={data.invoice.number} />, {formatDate(
						data.invoice.issuedOn,
					)}
				{:else if data.invoice}
					On draft invoice <InvoiceLink number={data.invoice.number} />
				{:else}
					Not invoiced yet
				{/if}
			</Card.Description>
			{#if data.invoice}
				<Card.Action>
					<StatusBadge state={data.invoice.state} />
				</Card.Action>
			{/if}
		</Card.Header>
		{#if !data.invoice || data.voided.length}
			<Card.Content class="flex flex-col items-start gap-3 text-sm">
				{#if data.voided.length}
					<p class="text-muted-foreground">Voided: {data.voided.join(", ")}</p>
				{/if}
				{#if !data.invoice && data.status === "completed"}
					<Button
						variant="outline"
						size="sm"
						href="{resolve('/(app)/invoices/new')}?customer={encodeURIComponent(data.customerCode)}"
					>
						<PlusIcon data-icon="inline-start" />
						New invoice for this customer
					</Button>
				{:else if !data.invoice}
					<p class="text-muted-foreground">It can be invoiced once it's completed.</p>
				{/if}
			</Card.Content>
		{/if}
	</Card.Root>
{/if}
