<!--
	@component
	What can be changed on a draft: more of the customer's orders and items, lines typed in by hand,
	and the payment term and notes.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import MoneyField from "#lib/components/form/money-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";

	import BillablePicker from "../form/billable-picker.svelte";
	import { getBillable, type getInvoice } from "../invoices.remote.ts";
	import { addLine, addToInvoice, updateTerms } from "./draft.remote.ts";

	let { invoice }: { invoice: Awaited<ReturnType<typeof getInvoice>>["invoice"] } = $props();

	const billable = $derived(await getBillable(invoice.customerId));
	const nothingToAdd = $derived(!billable.orders.length && !billable.items.length);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.invoices_add_title()}</Card.Title>
		<Card.Description>
			{m.invoices_add_description({ customer: invoice.customer.name })}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			{...addToInvoice.enhance(async ({ submit }) => {
				if (await submitted(submit)) toast.success(m.invoices_added());
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
				<SubmitButton variant="outline" class="self-end" pending={addToInvoice.pending}>
					{m.invoices_add_submit()}
				</SubmitButton>
			{/if}
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.invoices_add_line_title()}</Card.Title>
		<Card.Description>{m.invoices_add_line_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			{...addLine.enhance(async ({ element, submit }) => {
				if (await submitted(submit)) {
					element.reset();
					toast.success(m.invoices_line_added());
				}
			})}
			class="flex flex-col gap-4"
		>
			<input {...addLine.fields.id.as("hidden", String(invoice.id))} />
			<Field.FieldGroup class="grid gap-4 sm:grid-cols-2">
				<TextField
					field={addLine.fields.description}
					label={m.invoices_description_column()}
					class="sm:col-span-2"
				/>
				<NumberField
					field={addLine.fields.quantity}
					label={m.invoices_quantity()}
					value={1}
					min={0.01}
					step={0.01}
				/>
				<MoneyField field={addLine.fields.unitPrice} label={m.invoices_unit_price()} />
			</Field.FieldGroup>
			<SubmitButton variant="outline" class="self-end" pending={addLine.pending}>
				{m.invoices_add_line_submit()}
			</SubmitButton>
		</form>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.invoices_terms()}</Card.Title>
		<Card.Description>{m.invoices_terms_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			{...updateTerms.enhance(async ({ submit }) => {
				if (await submitted(submit)) toast.success(m.invoices_terms_saved());
			})}
			class="flex flex-col gap-4"
		>
			<input {...updateTerms.fields.id.as("hidden", String(invoice.id))} />
			<Field.FieldGroup>
				<NumberField
					field={updateTerms.fields.paymentTermDays}
					label={m.invoices_payment_term_days()}
					value={invoice.paymentTermDays}
					min={0}
					step={1}
				/>
				<TextField
					field={updateTerms.fields.notes}
					label={m.invoices_notes()}
					value={invoice.notes}
					multiline
					description={m.invoices_notes_description()}
				/>
			</Field.FieldGroup>
			<SubmitButton variant="outline" class="self-end" pending={updateTerms.pending}>
				{m.invoices_save_terms()}
			</SubmitButton>
		</form>
	</Card.Content>
</Card.Root>
