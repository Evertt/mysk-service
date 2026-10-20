<!--
	@component
	Records a unit's condition in the office, or one of its components' (`component`): its score and
	the advice that goes with it. A correction: it counts until a newer one, e.g. the next completed
	checklist's.
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
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

<FormDialog
	{form}
	title={component
		? m.condition_record_component_title({
				component: `${component.number} ${component.name}`,
			})
		: m.condition_record_title({ unit: unit.title })}
	description={component
		? m.condition_record_component_description()
		: m.condition_record_description()}
	submitLabel={m.condition_save()}
	hidden={{
		serialNumber: unit.serialNumber,
		componentId: component ? String(component.id) : "",
	}}
	reset
	done={m.condition_recorded_toast()}
	class="sm:max-w-md"
	bind:open
>
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
</FormDialog>
