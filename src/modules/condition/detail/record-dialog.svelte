<!--
	@component
	Records a unit's condition in the office: its score and the advice that goes with it.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { errorMessage } from "#lib/utils.ts";

	import { recordCondition } from "../condition.remote.ts";
	import { scoreLimits } from "../model.ts";

	let {
		unit,
		score,
		open = $bindable(false),
	}: {
		unit: { serialNumber: string; title: string };
		/** The latest score, to start from. */
		score: number | null;
		open?: boolean;
	} = $props();

	const form = $derived(recordCondition.for(unit.serialNumber));
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.condition_record_title({ unit: unit.title })}</Dialog.Title>
			<Dialog.Description>{m.condition_record_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ element, submit }) => {
				try {
					if (!(await submit())) return;
				} catch (error) {
					toast.error(errorMessage(error, m.common_error_generic()));
					return;
				}
				element.reset();
				open = false;
				toast.success(m.condition_recorded_toast());
			})}
			class="flex flex-col gap-6"
		>
			<input {...form.fields.serialNumber.as("hidden", unit.serialNumber)} />
			<Field.FieldGroup>
				<NumberField
					field={form.fields.score}
					label={m.condition_field_score()}
					min={scoreLimits.min}
					max={scoreLimits.max}
					step={1}
					value={score}
				/>
				<TextField
					field={form.fields.advice}
					label={m.condition_field_advice()}
					multiline
					placeholder={m.condition_advice_placeholder()}
					description={m.condition_advice_description()}
				/>
			</Field.FieldGroup>
			<Field.FieldError errors={form.fields.issues()} />
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="ghost">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<SubmitButton pending={form.pending}>{m.condition_save()}</SubmitButton>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
