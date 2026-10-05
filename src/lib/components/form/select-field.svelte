<!--
	@component
	A native select (so it works without JavaScript) for a string field. Options with a `group` are
	shown under that heading. With a `placeholder`, an empty option is added first, e.g. for
	optional fields.
-->
<script lang="ts" module>
	export interface SelectOption {
		value: string;
		label: string;
		group?: string;
	}
</script>

<script lang="ts">
	import type { RemoteFormField } from "$app/server";

	import FormField from "./form-field.svelte";

	let {
		field,
		label,
		options,
		value,
		placeholder,
		onchange,
		...rest
	}: {
		field: RemoteFormField<string>;
		label: string;
		options: SelectOption[];
		/** The initial value, e.g. of the record being edited. */
		value?: string | null;
		placeholder?: string;
		onchange?: (value: string) => void;
		description?: string;
		class?: string;
	} = $props();

	const groups = $derived(
		Map.groupBy(options, (option) => option.group ?? "") as Map<string, SelectOption[]>,
	);
</script>

<FormField {label} issues={field.issues()} description={rest.description} class={rest.class}>
	{#snippet children({ id })}
		<NativeSelect.Root
			{id}
			class="w-full"
			{...field.as("select", value ?? "")}
			onchange={(event) => onchange?.(event.currentTarget.value)}
		>
			{#if placeholder !== undefined}
				<NativeSelect.Option value="">{placeholder}</NativeSelect.Option>
			{/if}
			{#each groups as [group, groupOptions] (group)}
				{#if group}
					<NativeSelect.OptGroup label={group}>
						{#each groupOptions as option (option.value)}
							<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.OptGroup>
				{:else}
					{#each groupOptions as option (option.value)}
						<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
					{/each}
				{/if}
			{/each}
		</NativeSelect.Root>
	{/snippet}
</FormField>
