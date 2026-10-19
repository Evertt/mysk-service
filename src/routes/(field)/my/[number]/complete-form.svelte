<!--
	@component
	Completes a job with the work order's sign-off: the engineer's signature, under their name as the
	office knows them (shown, not sent), then the name of who signs for the customer and their
	signature. Both signatures are required. A refusal of the order as a whole (e.g. a checklist that
	isn't completed) shows until the modules' cards change what the order may do (`partsChanged`).
-->
<script lang="ts">
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import { toast } from "svelte-sonner";

	import FormField from "#lib/components/form/form-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";

	import { completeWork } from "../portal.remote.ts";
	import SignaturePad from "./signature-pad.svelte";

	let {
		orderId,
		contactName,
		engineerName,
		partsChanged,
	}: { orderId: number; contactName: string; engineerName: string; partsChanged: number } =
		$props();

	let signature = $state("");
	let engineerSignature = $state("");
	const fields = $derived(completeWork.fields);

	// `partsChanged` as it was when the form was last sent: once it's changed, the refusal is outdated.
	let sentAt = $state(0);
	const refusal = $derived(sentAt === partsChanged ? fields.issues() : undefined);
</script>

<form
	{...completeWork.enhance(async ({ submit }) => {
		sentAt = partsChanged;
		if (await submitted(submit)) toast.success(m.portal_job_completed());
	})}
	class="flex flex-col gap-6"
>
	<input {...fields.id.as("hidden", String(orderId))} />
	<fieldset class="flex flex-col gap-4" data-signature="engineer">
		<legend class="mb-2 text-sm font-semibold">{m.portal_engineer_signature()}</legend>
		<!-- Not submitted: the server signs in the engineer's own name. -->
		<FormField
			label={m.portal_engineer_name()}
			issues={undefined}
			description={m.portal_engineer_name_description()}
		>
			{#snippet children({ id })}
				<Input {id} value={engineerName} readonly />
			{/snippet}
		</FormField>
		<SignaturePad
			bind:value={engineerSignature}
			label={m.portal_engineer_signature_pad()}
			invalid={!!fields.engineerSignature.issues()?.length}
		/>
		<input {...fields.engineerSignature.as("hidden", engineerSignature)} />
		<Field.FieldError errors={fields.engineerSignature.issues()} />
	</fieldset>
	<fieldset class="flex flex-col gap-4" data-signature="customer">
		<legend class="mb-2 text-sm font-semibold">{m.portal_customer_signature()}</legend>
		<TextField
			field={fields.signerName}
			label={m.portal_signed_by()}
			value={contactName}
			autocomplete="off"
			description={m.portal_signed_by_description()}
		/>
		<SignaturePad bind:value={signature} invalid={!!fields.signature.issues()?.length} />
		<input {...fields.signature.as("hidden", signature)} />
		<Field.FieldError errors={fields.signature.issues()} />
	</fieldset>
	<Field.FieldError errors={refusal} />
	<SubmitButton
		size="lg"
		class="h-12 text-base"
		icon={CircleCheckIcon}
		pending={completeWork.pending}
	>
		{m.portal_complete_job()}
	</SubmitButton>
</form>
