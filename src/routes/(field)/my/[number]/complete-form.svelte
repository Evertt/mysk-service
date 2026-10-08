<!--
	@component
	Completes a job with the customer's sign-off: the name of who signs, and their signature.
-->
<script lang="ts">
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import { toast } from "svelte-sonner";

	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { completeWork } from "../portal.remote.ts";
	import SignaturePad from "./signature-pad.svelte";

	let { orderId, contactName }: { orderId: number; contactName: string } = $props();

	let signature = $state("");
	const fields = $derived(completeWork.fields);
</script>

<form
	{...completeWork.enhance(async ({ submit }) => {
		if (await submit()) toast.success(m.portal_job_completed());
	})}
	class="flex flex-col gap-4"
>
	<input {...fields.id.as("hidden", String(orderId))} />
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
