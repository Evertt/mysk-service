<!--
	@component
	An amount in euros, for a field stored in cents: pair it with `cents()` from `#lib/schema.js`,
	and pass the stored value in cents.
-->
<script lang="ts">
	import type { RemoteFormField } from "$app/server";

	import FormField from "./form-field.svelte";

	let {
		field,
		label,
		cents,
		...rest
	}: {
		field: RemoteFormField<number>;
		label: string;
		/** The initial amount in cents, e.g. of the record being edited. */
		cents?: number | null;
		description?: string;
		class?: string;
	} = $props();
</script>

<FormField {label} issues={field.issues()} description={rest.description} class={rest.class}>
	{#snippet children({ id })}
		<InputGroup.Root>
			<InputGroup.Addon>
				<InputGroup.Text>€</InputGroup.Text>
			</InputGroup.Addon>
			<InputGroup.Input
				{id}
				min={0}
				step={0.01}
				class="tabular-nums"
				{...field.as("number", cents == null ? undefined : cents / 100)}
			/>
		</InputGroup.Root>
	{/snippet}
</FormField>
