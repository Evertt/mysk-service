<!--
	@component
	Sets the hours of labour on a job under way, or says why it can't.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";

	import { logHours } from "../portal.remote.ts";

	let { orderId, hours }: { orderId: number; hours: number } = $props();
</script>

<form
	{...logHours.enhance(async ({ submit }) => {
		if (await submitted(submit)) toast.success(m.portal_hours_saved());
	})}
	class="flex flex-col gap-2"
>
	<input {...logHours.fields.id.as("hidden", String(orderId))} />
	<div class="flex items-end gap-2">
		<NumberField
			field={logHours.fields.laborHours}
			label={m.portal_hours()}
			value={hours}
			min={0}
			step={0.25}
			class="flex-1"
		/>
		<SubmitButton size="lg" class="h-12" pending={logHours.pending}>
			{m.portal_save_hours()}
		</SubmitButton>
	</div>
	<!-- What's in the way of the order as a whole, e.g. a job that isn't started. -->
	<Field.FieldError errors={logHours.fields.issues()} />
</form>
