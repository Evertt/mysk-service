<!--
	@component
	Asks before a bulk action runs: to confirm it (e.g. a delete), or to choose its parameter
	(e.g. the engineer to assign), whose options load when it opens. Says how many of the selected
	rows it applies to, if not all. `onrun` runs the action with the chosen value. Make it anew for
	each time it asks (e.g. in a `{#key}`), so it starts without a choice.
-->
<script lang="ts" generics="TData">
	import { formatNumber } from "#lib/format.js";

	import type { BulkAction } from "./bulk-actions.js";

	let {
		action,
		open = $bindable(false),
		count,
		applies,
		busy = false,
		onrun,
	}: {
		action: BulkAction<TData>;
		open?: boolean;
		/** How many rows are selected. */
		count: number;
		/** How many of them the action applies to (as far as the table can tell). */
		applies: number;
		busy?: boolean;
		onrun: (value?: string) => void;
	} = $props();

	const selectId = $props.id();
	let value = $state("");
	// The parameter's choices, loaded when it opens (it's made anew for each action it asks about).
	const choices = $derived(action.parameter && Promise.resolve(action.parameter.options()));

	const title = $derived(
		action.parameter?.title(count) ?? action.confirm?.title(count) ?? action.label(),
	);
	const description = $derived(
		action.parameter?.description?.() ?? action.confirm?.description() ?? "",
	);
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<form
			class="flex flex-col gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				onrun(action.parameter ? value : undefined);
			}}
		>
			<AlertDialog.Header>
				<AlertDialog.Title>{title}</AlertDialog.Title>
				{#if description}
					<AlertDialog.Description>{description}</AlertDialog.Description>
				{/if}
			</AlertDialog.Header>
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
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button">{m.common_cancel()}</AlertDialog.Cancel>
				<Button
					type="submit"
					variant={action.destructive ? "destructive" : "default"}
					disabled={busy || (!!action.parameter && !value)}
				>
					{#if busy}
						<Spinner data-icon="inline-start" />
					{/if}
					{action.parameter ? m.common_bulk_apply() : action.label()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
