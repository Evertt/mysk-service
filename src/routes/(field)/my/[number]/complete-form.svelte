<!--
	@component
	Completes a job with the work order's sign-off: the engineer's name and signature, then the name
	of who signs for the customer and their signature. Both are required.
-->
<script lang="ts">
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { completeWork } from "../portal.remote.ts";
	import SignaturePad from "./signature-pad.svelte";

	let {
		orderId,
		contactName,
		engineerName,
	}: { orderId: number; contactName: string; engineerName: string } = $props();

	let signature = $state("");
	let engineerSignature = $state("");
	const fields = $derived(completeWork.fields);
</script>

<form
	{...completeWork.enhance(async ({ submit }) => {
		if (await submit()) toast.success(m.portal_job_completed());
	})}
	class="flex flex-col gap-6"
>
	<input {...fields.id.as("hidden", String(orderId))} />
	<fieldset class="flex flex-col gap-4" data-signature="engineer">
		<legend class="mb-2 text-sm font-semibold">{m.portal_engineer_signature()}</legend>
		<TextField
			field={fields.engineerName}
			label={m.portal_engineer_name()}
			value={engineerName}
			autocomplete="name"
		/>
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
	<Field.FieldError errors={fields.issues()} />
	<SubmitButton
		size="lg"
		class="h-12 text-base"
		icon={CircleCheckIcon}
		pending={completeWork.pending}
	>
		{m.portal_complete_job()}
	</SubmitButton>
</form>
