<!--
	@component
	A section of a record's form (`RecordForm`): a card with a title and a description, its fields
	(`children`) in two columns where there's room (a field that needs the width says
	`class="md:col-span-2"`), or laid out by themselves (`columns={false}`, e.g. a fieldset).
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		columns = true,
		children,
	}: {
		title: string;
		description?: string;
		/** Whether the fields go in two columns; `false` for a section that lays out its own. */
		columns?: boolean;
		children: Snippet;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		{#if description}
			<Card.Description>{description}</Card.Description>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if columns}
			<Field.FieldGroup class="grid gap-6 md:grid-cols-2">
				{@render children()}
			</Field.FieldGroup>
		{:else}
			{@render children()}
		{/if}
	</Card.Content>
</Card.Root>
