<!--
	@component
	Completes a job with the customer's sign-off: the name of who signs, and their signature.
-->
<script lang="ts">
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import { toast } from "svelte-sonner";

	import TextField from "#lib/components/form/text-field.svelte";

	import { completeWork } from "../portal.remote.js";
	import SignaturePad from "./signature-pad.svelte";

	let { orderId, contactName }: { orderId: number; contactName: string } = $props();

	let signature = $state("");
	const fields = $derived(completeWork.fields);
</script>

<form
	{...completeWork.enhance(async ({ submit }) => {
		if (await submit()) toast.success("Job completed");
	})}
	class="flex flex-col gap-4"
>
	<input {...fields.id.as("hidden", String(orderId))} />
	<TextField
		field={fields.signerName}
		label="Signed by"
		value={contactName}
		autocomplete="off"
		description="The customer's name, as they sign."
	/>
	<SignaturePad bind:value={signature} invalid={!!fields.signature.issues()?.length} />
	<input {...fields.signature.as("hidden", signature)} />
	<Field.FieldError errors={fields.signature.issues()} />
	<Field.FieldError errors={fields.issues()} />
	<Button type="submit" size="lg" class="h-12 text-base" disabled={!!completeWork.pending}>
		{#if completeWork.pending}
			<Spinner data-icon="inline-start" />
		{:else}
			<CircleCheckIcon data-icon="inline-start" />
		{/if}
		Complete job
	</Button>
</form>
