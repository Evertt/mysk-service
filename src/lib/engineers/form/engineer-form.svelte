<!--
	@component
	The engineer form, for creating (`createEngineer`) and editing (`updateEngineer`, with
	`engineer`) an engineer.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import MoneyField from "#lib/components/form/money-field.svelte";
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

<form
	{...form.enhance(async ({ submit }) => {
		// On success the server redirects to the engineer; otherwise the fields show what's wrong.
		if (await submit()) toast.success(engineer ? m.engineers_saved() : m.engineers_added());
	})}
	class="flex flex-col gap-6"
>
	{#if engineer}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateEngineer).fields.id.as("hidden", String(engineer.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.engineers_form_contact()}</Card.Title>
			<Card.Description>{m.engineers_form_contact_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
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
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.engineers_form_work()}</Card.Title>
			<Card.Description>{m.engineers_form_work_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
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
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={engineer ? m.engineers_save() : m.engineers_add()}
		{cancelHref}
	/>
</form>
