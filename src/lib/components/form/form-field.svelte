<!--
	@component
	Label, control, description and validation issues for one field of a remote form. The control is
	rendered by `children`, which receives the `id` to put on it. Use the specific fields
	(`TextField`, `SelectField`, …) where they fit.
-->
<script lang="ts">
	import type { RemoteFormIssue } from "$app/server";
	import type { Snippet } from "svelte";

	let {
		label,
		issues,
		description,
		class: className,
		children,
	}: {
		label: string;
		issues: RemoteFormIssue[] | undefined;
		description?: string;
		class?: string;
		children: Snippet<[{ id: string }]>;
	} = $props();

	const id = $props.id();
</script>

<Field.Field data-invalid={issues?.length ? true : undefined} class={className}>
	<Field.FieldLabel for={id}>{label}</Field.FieldLabel>
	{@render children({ id })}
	{#if description}
		<Field.FieldDescription>{description}</Field.FieldDescription>
	{/if}
	<Field.FieldError errors={issues} />
</Field.Field>
