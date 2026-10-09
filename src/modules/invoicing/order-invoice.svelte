<!--
	@component
	The invoicing module's card on an order's page (the `order` slot in `#lib/modules/manifests.ts`): the
	invoice the order is on, or, once it's completed, a way to bill it. Nothing for a cancelled
	order that was never invoiced.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";

	import { formatDate } from "#lib/i18n/format.ts";
	import { messageParts } from "#lib/i18n/parts.ts";

	import InvoiceLink from "./invoice-link.svelte";
	import { getOrderInvoice } from "./invoicing.remote.ts";
	import StatusBadge from "./status-badge.svelte";

	let { number }: { number: string } = $props();

	const data = $derived(await getOrderInvoice(number));
</script>

{#if data.invoice || data.status !== "cancelled"}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.invoices_column_invoice()}</Card.Title>
			<Card.Description>
				{#if data.invoice}
					{@const { number, issuedOn } = data.invoice}
					{@const parts = messageParts((slot) =>
						issuedOn
							? m.invoices_invoiced_on({ invoice: slot("invoice"), date: formatDate(issuedOn) })
							: m.invoices_on_draft({ invoice: slot("invoice") }),
					)}
					{#each parts as part, i (i)}{#if "text" in part}{part.text}{:else}<InvoiceLink
								{number}
							/>{/if}{/each}
				{:else}
					{m.invoices_not_invoiced()}
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
					<p class="text-muted-foreground">
						{m.invoices_voided_list({ numbers: data.voided.join(", ") })}
					</p>
				{/if}
				{#if !data.invoice && data.status === "completed"}
					<Button
						variant="outline"
						size="sm"
						href="{resolve('/(app)/invoices/new')}?customer={encodeURIComponent(data.customerCode)}"
					>
						<PlusIcon data-icon="inline-start" />
						{m.invoices_new_for_customer()}
					</Button>
				{:else if !data.invoice}
					<p class="text-muted-foreground">{m.invoices_once_completed()}</p>
				{/if}
			</Card.Content>
		{/if}
	</Card.Root>
{/if}
