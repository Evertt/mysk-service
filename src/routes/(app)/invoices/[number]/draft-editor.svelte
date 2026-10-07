<!--
	@component
	What can be changed on a draft: more of the customer's orders and items, lines typed in by hand,
	and the payment term and notes.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import MoneyField from "#lib/components/form/money-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import BillablePicker from "../billable-picker.svelte";
	import {
		addLine,
		addToInvoice,
		getBillable,
		type getInvoice,
		updateTerms,
	} from "../invoices.remote.js";

	let { invoice }: { invoice: Awaited<ReturnType<typeof getInvoice>>["invoice"] } = $props();

	const billable = $derived(await getBillable(invoice.customerId));
	const nothingToAdd = $derived(!billable.orders.length && !billable.items.length);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Add to the invoice</Card.Title>
		<Card.Description>
			{invoice.customer.name}'s completed orders and fees that aren't invoiced yet.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			{...addToInvoice.enhance(async ({ submit }) => {
				if (await submit()) toast.success("Added to the invoice");
			})}
			class="flex flex-col gap-4"
		>
			<input {...addToInvoice.fields.id.as("hidden", String(invoice.id))} />
			<BillablePicker
				{billable}
				orderIds={addToInvoice.fields.orderIds}
				items={addToInvoice.fields.items}
				checked={false}
			/>
			<Field.FieldError errors={addToInvoice.fields.issues()} />
			{#if !nothingToAdd}
				<Button type="submit" variant="outline" class="self-end" disabled={!!addToInvoice.pending}>
					{#if addToInvoice.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					Add to invoice
				</Button>
			{/if}
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Add a line</Card.Title>
		<Card.Description>For anything else, e.g. travel costs.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			{...addLine.enhance(async ({ element, submit }) => {
				if (await submit()) {
					element.reset();
					toast.success("Line added");
				}
			})}
			class="flex flex-col gap-4"
		>
			<input {...addLine.fields.id.as("hidden", String(invoice.id))} />
			<Field.FieldGroup class="grid gap-4 sm:grid-cols-2">
				<TextField field={addLine.fields.description} label="Description" class="sm:col-span-2" />
				<NumberField
					field={addLine.fields.quantity}
					label="Quantity"
					value={1}
					min={0.01}
					step={0.01}
				/>
				<MoneyField field={addLine.fields.unitPrice} label="Unit price" />
			</Field.FieldGroup>
			<Button type="submit" variant="outline" class="self-end" disabled={!!addLine.pending}>
				{#if addLine.pending}
					<Spinner data-icon="inline-start" />
				{/if}
				Add line
			</Button>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Terms</Card.Title>
		<Card.Description
			>The VAT rate is the organization's when the invoice is issued.</Card.Description
		>
	</Card.Header>
	<Card.Content>
		<form
			{...updateTerms.enhance(async ({ submit }) => {
				if (await submit()) toast.success("Terms saved");
			})}
			class="flex flex-col gap-4"
		>
			<input {...updateTerms.fields.id.as("hidden", String(invoice.id))} />
			<Field.FieldGroup>
				<NumberField
					field={updateTerms.fields.paymentTermDays}
					label="Payment term (days)"
					value={invoice.paymentTermDays}
					min={0}
					step={1}
				/>
				<TextField
					field={updateTerms.fields.notes}
					label="Notes"
					value={invoice.notes}
					multiline
					description="Printed on the invoice."
				/>
			</Field.FieldGroup>
			<Button type="submit" variant="outline" class="self-end" disabled={!!updateTerms.pending}>
				{#if updateTerms.pending}
					<Spinner data-icon="inline-start" />
				{/if}
				Save terms
			</Button>
		</form>
	</Card.Content>
</Card.Root>
