<!--
	@component
	A checkbox for a boolean field. The schema must default it to false
	(`v.optional(v.boolean(), false)`), since unchecked boxes aren't submitted.
-->
<script lang="ts">
	import type { RemoteFormField } from "$app/server";

	let {
		field,
		label,
		checked = false,
		description,
	}: {
		field: RemoteFormField<boolean>;
		label: string;
		/** The initial state, e.g. of the record being edited. */
		checked?: boolean;
		description?: string;
	} = $props();

	const id = $props.id();
	// The shadcn checkbox is a button with a hidden input; it takes the field's name, not its
	// input `type`.
	const attributes = $derived(field.as("checkbox"));
	const issues = $derived(field.issues());
	// Starts from `checked`; the checkbox's hidden input submits it under the field's name.
	let isChecked = $derived(checked);
</script>

<Field.Field orientation="horizontal" data-invalid={issues?.length ? true : undefined}>
	<Checkbox
		{id}
		name={attributes.name}
		aria-invalid={attributes["aria-invalid"]}
		bind:checked={isChecked}
	/>
	<Field.FieldContent>
		<Field.FieldLabel for={id}>{label}</Field.FieldLabel>
		{#if description}
			<Field.FieldDescription>{description}</Field.FieldDescription>
		{/if}
		<Field.FieldError errors={issues} />
	</Field.FieldContent>
</Field.Field>
