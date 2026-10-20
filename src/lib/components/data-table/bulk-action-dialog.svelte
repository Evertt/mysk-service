<!--
	@component
	Asks before a bulk action runs (a `ConfirmDialog`): to confirm it (e.g. a delete), or to choose its
	parameter (e.g. the engineer to assign), whose options load when it opens. Says how many of the
	selected rows it applies to, if not all. For a single row's action, `record` names the row in the
	title. `onrun` runs the action with the chosen value; once it went through, `ondone` gets its
	result and the dialog closes, or leaves for the page the result points to. Make it anew for
	each time it asks (e.g. in a `{#key}`), so it starts without a choice.
-->
<script lang="ts" generics="TData, Where = never">
	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import type { BulkAction, BulkResult } from "./bulk-actions.ts";

	let {
		action,
		open = $bindable(false),
		count,
		applies,
		record,
		onrun,
		ondone,
	}: {
		action: BulkAction<TData, Where>;
		open?: boolean;
		/** How many rows are selected. */
		count: number;
		/** How many of them the action applies to (as far as the table can tell). */
		applies: number;
		/** The row it's for, by its label, when it's for a single row rather than a selection. */
		record?: string;
		onrun: (value?: string) => Promise<BulkResult>;
		/** Called with the result once it ran, before the dialog closes. */
		ondone: (result: BulkResult) => void;
	} = $props();

	const selectId = $props.id();
	let value = $state("");
	// The parameter's choices, loaded when it opens (it's made anew for each action it asks about).
	const choices = $derived(action.parameter && Promise.resolve(action.parameter.options()));

	const title = $derived(
		record !== undefined
			? m.common_row_action_title({ action: action.label(), label: record })
			: (action.parameter?.title(count) ?? action.confirm?.title(count) ?? action.label()),
	);
	const description = $derived(
		action.parameter?.description?.() ?? action.confirm?.description() ?? "",
	);
</script>

<ConfirmDialog
	bind:open
	{title}
	{description}
	confirmLabel={action.parameter ? m.common_bulk_apply() : action.label()}
	destructive={action.destructive}
	disabled={!!action.parameter && !value}
	onconfirm={() => onrun(action.parameter ? value : undefined)}
	ondone={(result) => result && ondone(result)}
	leave={(result) => result?.href}
>
	{#if applies < count}
		<p class="text-sm text-muted-foreground">
			{m.common_bulk_applies({ applies: formatNumber(applies), count: formatNumber(count) })}
		</p>
	{/if}
	{#if action.parameter && choices}
		<Field.Field>
			<Field.Label for={selectId}>{action.parameter.label()}</Field.Label>
			{#await choices}
				<NativeSelect.Root id={selectId} disabled class="w-full">
					<NativeSelect.Option value="">{m.common_table_loading()}</NativeSelect.Option>
				</NativeSelect.Root>
			{:then options}
				<NativeSelect.Root id={selectId} bind:value required class="w-full">
					<NativeSelect.Option value="" disabled>{m.common_bulk_choose()}</NativeSelect.Option>
					{#each options as option (option.value)}
						<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			{/await}
		</Field.Field>
	{/if}
</ConfirmDialog>
