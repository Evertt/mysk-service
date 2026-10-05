<script lang="ts">
	import type { RemoteFormField } from "$app/server";

	import FormField from "./form-field.svelte";

	let {
		field,
		label,
		value,
		...rest
	}: {
		field: RemoteFormField<number>;
		label: string;
		/** The initial value, e.g. of the record being edited. */
		value?: number | null;
		min?: number;
		max?: number;
		step?: number | "any";
		description?: string;
		class?: string;
	} = $props();
</script>

<FormField {label} issues={field.issues()} description={rest.description} class={rest.class}>
	{#snippet children({ id })}
		<Input
			{id}
			min={rest.min}
			max={rest.max}
			step={rest.step}
			class="tabular-nums"
			{...field.as("number", value ?? undefined)}
		/>
	{/snippet}
</FormField>
