<!--
	@component
	The engineer form, for creating (`createEngineer`) and editing (`updateEngineer`, with
	`engineer`) an engineer.
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import { specialtyOptions } from "#lib/components/engineers/display.js";
	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import FormActions from "#lib/components/form/form-actions.svelte";
	import MoneyField from "#lib/components/form/money-field.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { toDateInput } from "#lib/schema.js";

	import { engineerRegions } from "./engineer-schema.js";
	import type { createEngineer, getEngineer, updateEngineer } from "./engineers.remote.js";

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
		if (await submit()) toast.success(engineer ? "Engineer saved" : "Engineer added");
	})}
	class="flex flex-col gap-6"
>
	{#if engineer}
		<!-- Only the edit form has an id field. -->
		<input {...(form as typeof updateEngineer).fields.id.as("hidden", String(engineer.id))} />
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Contact</Card.Title>
			<Card.Description>How planners and customers reach them.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<TextField
					field={fields.name}
					label="Name"
					value={engineer?.name}
					autocomplete="off"
					class="md:col-span-2"
				/>
				<TextField
					field={fields.email}
					label="Email"
					type="email"
					value={engineer?.email}
					autocomplete="off"
				/>
				<TextField
					field={fields.phone}
					label="Phone"
					type="tel"
					value={engineer?.phone}
					autocomplete="off"
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Work</Card.Title>
			<Card.Description>What they work on, where, and at what rate.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				<SelectField
					field={fields.specialty}
					label="Specialty"
					placeholder={engineer ? undefined : "Choose a specialty"}
					value={engineer?.specialty}
					options={specialtyOptions.map(({ value, label }) => ({ value, label }))}
				/>
				<SelectField
					field={fields.region}
					label="Region"
					placeholder={engineer ? undefined : "Choose a region"}
					value={engineer?.region}
					options={engineerRegions.map((region) => ({ value: region, label: region }))}
				/>
				<MoneyField
					field={fields.hourlyRate}
					label="Hourly rate"
					cents={engineer?.hourlyRate}
					description="Charged for their labour on orders."
				/>
				<TextField
					field={fields.hiredAt}
					label="Hired"
					type="date"
					value={toDateInput(engineer?.hiredAt)}
				/>
				<CheckboxField
					field={fields.active}
					label="Active"
					checked={engineer?.active ?? true}
					description="Only active engineers can be assigned to new orders."
				/>
			</Field.FieldGroup>
		</Card.Content>
	</Card.Root>

	<FormActions
		pending={form.pending}
		submitLabel={engineer ? "Save engineer" : "Add engineer"}
		{cancelHref}
	/>
</form>
