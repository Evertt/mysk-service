<!--
	@component
	What can be changed on a draft credit note: its reason, and on a standalone one more lines typed
	in (what each credits, as a positive price). One against an invoice credits that invoice's lines;
	another module's keeps the lines and the reason it was made with.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";

	import { isMadeElsewhere } from "../credit-note.ts";
	import type { getCreditNote } from "../credit-notes.remote.ts";
	import AddLineCard from "./add-line-card.svelte";
	import { updateCreditReason } from "./draft.remote.ts";

	let { credit }: { credit: Awaited<ReturnType<typeof getCreditNote>>["creditNote"] } = $props();
</script>

{#if isMadeElsewhere(credit)}
	<Card.Root data-made-elsewhere>
		<Card.Header>
			<Card.Title>{m.invoices_credit_elsewhere_title()}</Card.Title>
			<Card.Description>{m.invoices_credit_elsewhere_description()}</Card.Description>
		</Card.Header>
	</Card.Root>
{:else}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.invoices_credit_reason()}</Card.Title>
			<Card.Description>{m.invoices_credit_reason_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				{...updateCreditReason.enhance(async ({ submit }) => {
					if (await submitted(submit)) toast.success(m.invoices_credit_reason_saved());
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

	{#if !credit.invoice}
		<AddLineCard kind="creditNote" id={credit.id} />
	{/if}
{/if}
