<!--
	@component
	Adds a line typed in to a draft of either kind: its description, quantity and unit price (on a
	credit note, what it credits, as a positive price).
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import MoneyField from "#lib/components/form/money-field.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";

	import type { DocumentKind } from "../document.ts";
	import { addLine } from "./draft.remote.ts";

	let { kind, id }: { kind: DocumentKind; id: number } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.invoices_add_line_title()}</Card.Title>
		<Card.Description>
			{kind === "invoice"
				? m.invoices_add_line_description()
				: m.invoices_credit_add_line_description()}
		</Card.Description>
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
			<input {...addLine.fields.kind.as("hidden", kind)} />
			<input {...addLine.fields.id.as("hidden", String(id))} />
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
