<!--
	@component
	The engineer form, for creating (`createEngineer`) and editing (`updateEngineer`, with
	`engineer`) an engineer.
-->
<script lang="ts">
	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import FormSection from "#lib/components/form/form-section.svelte";
	import MoneyField from "#lib/components/form/money-field.svelte";
	import RecordForm from "#lib/components/form/record-form.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { regionOptions, specialtyOptions } from "../display.ts";
	import type { createEngineer, getEngineer, updateEngineer } from "../engineers.remote.ts";

	type Engineer = Awaited<ReturnType<typeof getEngineer>>["engineer"];

	let {
		form,
		engineer,
		cancelHref,
	}: {
		form: typeof createEngineer | typeof updateEngineer;
		engineer?: Engineer;
		cancelHref: string;
	} = $props();

	const fields = $derived(form.fields);
</script>

<RecordForm
	{form}
	record={engineer}
	snapshot="engineer"
	submitLabel={engineer ? m.engineers_save() : m.engineers_add()}
	done={engineer ? m.engineers_saved() : m.engineers_added()}
	{cancelHref}
>
	<FormSection
		title={m.engineers_form_contact()}
		description={m.engineers_form_contact_description()}
	>
		<TextField
			field={fields.name}
			label={m.engineers_field_name()}
			value={engineer?.name}
			autocomplete="off"
			class="md:col-span-2"
		/>
		<TextField
			field={fields.email}
			label={m.engineers_field_email()}
			type="email"
			value={engineer?.email}
			autocomplete="off"
		/>
		<TextField
			field={fields.phone}
			label={m.engineers_field_phone()}
			type="tel"
			value={engineer?.phone}
			autocomplete="off"
		/>
	</FormSection>

	<FormSection title={m.engineers_form_work()} description={m.engineers_form_work_description()}>
		<SelectField
			field={fields.specialty}
			label={m.engineers_field_specialty()}
			placeholder={engineer ? undefined : m.engineers_specialty_placeholder()}
			value={engineer?.specialty}
			options={specialtyOptions.map(({ value, label }) => ({ value, label }))}
		/>
		<SelectField
			field={fields.region}
			label={m.engineers_field_region()}
			placeholder={engineer ? undefined : m.engineers_region_placeholder()}
			value={engineer?.region}
			options={regionOptions()}
		/>
		<MoneyField
			field={fields.hourlyRate}
			label={m.engineers_field_hourly_rate()}
			cents={engineer?.hourlyRate}
			description={m.engineers_field_hourly_rate_description()}
		/>
		<TextField
			field={fields.hiredAt}
			label={m.engineers_field_hired()}
			type="date"
			value={engineer?.hiredAt.toString() ?? ""}
		/>
		<CheckboxField
			field={fields.active}
			label={m.engineers_field_active()}
			checked={engineer?.active ?? true}
			description={m.engineers_field_active_description()}
		/>
	</FormSection>
</RecordForm>
