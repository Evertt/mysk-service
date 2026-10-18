<!--
	@component
	What can be changed on a draft credit note: its reason, and on a standalone one more lines typed
	in (what each credits, as a positive price). One against an invoice credits that invoice's lines;
	another module's keeps the lines it was made with.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import MoneyField from "#lib/components/form/money-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { isMadeElsewhere } from "../credit-note.ts";
	import type { getCreditNote } from "../credit-notes.remote.ts";
	import { addCreditLine, updateCreditReason } from "./credit-note.remote.ts";

	let { credit }: { credit: Awaited<ReturnType<typeof getCreditNote>>["creditNote"] } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.invoices_credit_reason()}</Card.Title>
		<Card.Description>{m.invoices_credit_reason_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			{...updateCreditReason.enhance(async ({ submit }) => {
				if (await submit()) toast.success(m.invoices_credit_reason_saved());
			})}
			class="flex flex-col gap-4"
		>
			<input {...updateCreditReason.fields.id.as("hidden", String(credit.id))} />
			<TextField
				field={updateCreditReason.fields.reason}
				label={m.invoices_credit_reason()}
				value={credit.reason}
			/>
			<SubmitButton variant="outline" class="self-end" pending={updateCreditReason.pending}>
				{m.invoices_credit_save_reason()}
			</SubmitButton>
		</form>
	</Card.Content>
</Card.Root>

{#if isMadeElsewhere(credit)}
	<Card.Root data-lines-elsewhere>
		<Card.Header>
			<Card.Title>{m.invoices_credit_lines_elsewhere_title()}</Card.Title>
			<Card.Description>{m.invoices_credit_lines_elsewhere_description()}</Card.Description>
		</Card.Header>
	</Card.Root>
{:else if !credit.invoice}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.invoices_add_line_title()}</Card.Title>
			<Card.Description>{m.invoices_credit_add_line_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				{...addCreditLine.enhance(async ({ element, submit }) => {
					if (await submit()) {
						element.reset();
						toast.success(m.invoices_line_added());
					}
				})}
				class="flex flex-col gap-4"
			>
				<input {...addCreditLine.fields.id.as("hidden", String(credit.id))} />
				<Field.FieldGroup class="grid gap-4 sm:grid-cols-2">
					<TextField
						field={addCreditLine.fields.description}
						label={m.invoices_description_column()}
						class="sm:col-span-2"
					/>
					<NumberField
						field={addCreditLine.fields.quantity}
						label={m.invoices_quantity()}
						value={1}
						min={0.01}
						step={0.01}
					/>
					<MoneyField field={addCreditLine.fields.unitPrice} label={m.invoices_unit_price()} />
				</Field.FieldGroup>
				<SubmitButton variant="outline" class="self-end" pending={addCreditLine.pending}>
					{m.invoices_add_line_submit()}
				</SubmitButton>
			</form>
		</Card.Content>
	</Card.Root>
{/if}
