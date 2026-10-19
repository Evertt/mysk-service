<!--
	@component
	Records a unit's condition in the office, or one of its components' (`component`): its score and
	the advice that goes with it. A correction: it counts until a newer one, e.g. the next completed
	checklist's.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import NumberField from "#lib/components/form/number-field.svelte";
	import SubmitButton from "#lib/components/form/submit-button.svelte";
	import { submitted } from "#lib/components/form/submitted.ts";
	import TextField from "#lib/components/form/text-field.svelte";

	import { recordCondition } from "../condition.remote.ts";
	import { scoreLimits } from "../model.ts";

	let {
		unit,
		component,
		score,
		open = $bindable(false),
	}: {
		unit: { serialNumber: string; title: string };
		/** The component whose condition it is; none for the unit as a whole. */
		component?: { id: number; number: string; name: string };
		/** The latest score, to start from. */
		score: number | null;
		open?: boolean;
	} = $props();

	const form = $derived(
		recordCondition.for(component ? `${unit.serialNumber}-${component.id}` : unit.serialNumber),
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>
				{component
					? m.condition_record_component_title({
							component: `${component.number} ${component.name}`,
						})
					: m.condition_record_title({ unit: unit.title })}
			</Dialog.Title>
			<Dialog.Description>
				{component ? m.condition_record_component_description() : m.condition_record_description()}
			</Dialog.Description>
		</Dialog.Header>
		<form
			{...form.enhance(async ({ element, submit }) => {
				if (!(await submitted(submit))) return;
				element.reset();
				open = false;
				toast.success(m.condition_recorded_toast());
			})}
			class="flex flex-col gap-6"
		>
			<input {...form.fields.serialNumber.as("hidden", unit.serialNumber)} />
			<input {...form.fields.componentId.as("hidden", component ? String(component.id) : "")} />
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
