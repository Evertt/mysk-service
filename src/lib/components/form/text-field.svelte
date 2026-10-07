<script lang="ts">
	import type { RemoteFormField } from "$app/server";

	import FormField from "./form-field.svelte";

	let {
		field,
		label,
		value,
		type = "text",
		multiline = false,
		...rest
	}: {
		field: RemoteFormField<string>;
		label: string;
		/** The initial value, e.g. of the record being edited. */
		value?: string | null;
		type?: "text" | "email" | "tel" | "url" | "date" | "time" | "password";
		/** Render a textarea instead of an input. */
		multiline?: boolean;
		description?: string;
		placeholder?: string;
		autocomplete?: HTMLInputElement["autocomplete"];
		class?: string;
	} = $props();
</script>

<FormField {label} issues={field.issues()} description={rest.description} class={rest.class}>
	{#snippet children({ id })}
		{#if multiline}
			<Textarea {id} placeholder={rest.placeholder} {...field.as("text", value ?? undefined)} />
		{:else}
			<Input
				{id}
				placeholder={rest.placeholder}
				autocomplete={rest.autocomplete}
				{...field.as(type, value ?? undefined)}
			/>
		{/if}
	{/snippet}
</FormField>
