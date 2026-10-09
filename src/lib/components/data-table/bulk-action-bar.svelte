<!--
	@component
	The selection's action bar: while rows are selected, says how many, offers to clear the
	selection and runs the table's bulk `actions` (see `bulk-actions.ts`) on them, as buttons, or the
	first few as buttons and the rest in a menu. An action that doesn't apply to the selection is
	disabled, with the reason on hover and for screen readers. Actions that ask something first
	(a confirmation, an engineer to assign) open a dialog; the result shows as a toast, e.g.
	"7 updated, 2 skipped" with the reasons, and the selection is cleared.

	For a server-side table, pass `matching` (the rows' query `where` and key, and how many match in
	all): with every row of the page selected, it offers to select all the rows that match, and the
	action then acts on the `where`, the search and filters, rather than on ids (the server finds the
	rows again, in the tenant).

	Place it after `<table.Table>`; it sticks to the bottom of the screen when the page scrolls. The
	number selected is announced to screen readers, and Escape in the bar clears the selection.
-->
<script lang="ts" generics="TData extends RowData, Where = never">
	import { goto } from "$app/navigation";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import XIcon from "@lucide/svelte/icons/x";
	import type { RowData } from "@tanstack/svelte-table";
	import { toast } from "svelte-sonner";

	import { formatNumber } from "#lib/i18n/format.ts";
	import { errorMessage } from "#lib/utils.ts";

	import BulkActionDialog from "./bulk-action-dialog.svelte";
	import {
		applicability,
		type BulkAction,
		type BulkTarget,
		MAX_BULK_RECORDS,
		summarizeBulkResult,
	} from "./bulk-actions.ts";
	import { useTableContext } from "./table.svelte.ts";

	let {
		actions,
		matching,
		inline = 3,
	}: {
		actions: BulkAction<TData, Where>[];
		/**
		 * A server-side table's rows: what decides which match (the rows' query `where`), the key
		 * they came with and how many match in all.
		 */
		matching?: { where: Where; key: string; count: number };
		/** How many actions show as buttons; with more, all but the first ones go in a menu. */
		inline?: number;
	} = $props();

	const table = useTableContext<TData>();
	const barId = $props.id();

	const selected = $derived(table.getFilteredSelectedRowModel().rows);
	const rows = $derived(selected.map((row) => row.original));

	/** The key of the rows whose matching rows were all selected, while that's still so. */
	let matchingKey = $state<string>();
	const allMatching = $derived(
		!!matching &&
			matchingKey === matching.key &&
			table.getIsAllPageRowsSelected() &&
			matching.count > selected.length,
	);
	const canSelectMatching = $derived(
		!!matching &&
			!allMatching &&
			table.getIsAllPageRowsSelected() &&
			matching.count > selected.length &&
			matching.count <= MAX_BULK_RECORDS,
	);
	const count = $derived(allMatching ? matching!.count : selected.length);

	const states = $derived(
		actions.map((action) => ({ action, ...applicability(action, rows, allMatching) })),
	);
	const buttons = $derived(states.length > inline ? states.slice(0, inline - 1) : states);
	const menu = $derived(states.length > inline ? states.slice(inline - 1) : []);

	let busy = $state(false);
	/** The action whose dialog is open, if any. */
	let asking = $state.raw<(typeof states)[number]>();
	let dialogOpen = $state(false);

	function clear() {
		matchingKey = undefined;
		table.resetRowSelection(true);
	}

	function start(state: (typeof states)[number]) {
		if (state.disabled || busy) return;
		if (state.action.confirm || state.action.parameter) {
			// A new object, so the dialog starts anew (see `{#key asking}`).
			asking = { ...state };
			dialogOpen = true;
		} else {
			void run(state.action);
		}
	}

	async function run(action: BulkAction<TData, Where>, value?: string) {
		const target = (
			allMatching ? { matching: matching!.where } : { ids: selected.map((row) => Number(row.id)) }
		) as BulkTarget<Where>;
		busy = true;
		try {
			const result = await action.run(target, value);
			dialogOpen = false;
			const summary = summarizeBulkResult(result, action.done);
			const show = { success: toast.success, warning: toast.warning, error: toast.error };
			show[summary.tone](summary.title, {
				description: summary.details.join("\n") || undefined,
				// Long enough to read the reasons.
				duration: summary.details.length ? 12_000 : undefined,
				classes: { description: "whitespace-pre-line" },
			});
			clear();
			if (result.href) await goto(result.href);
		} catch (error) {
			toast.error(errorMessage(error, m.common_error_generic()));
		} finally {
			busy = false;
		}
	}

	const label = $derived(
		allMatching
			? m.common_bulk_all_selected({ count: formatNumber(count) })
			: m.common_bulk_selected({ count: formatNumber(count) }),
	);
</script>

<!-- Always there, so screen readers announce the changes. -->
<div data-slot="bulk-action-count" class="sr-only" aria-live="polite" aria-atomic="true">
	{count ? label : ""}
</div>

{#if count}
	<!-- Escape from any of its controls clears the selection. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		role="region"
		aria-label={m.common_bulk_toolbar()}
		data-slot="bulk-action-bar"
		class="sticky bottom-2 z-40 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-md"
		onkeydown={(event) => {
			if (event.key === "Escape" && !event.defaultPrevented) clear();
		}}
	>
		<span class="px-2 text-sm font-medium tabular-nums">{label}</span>
		{#if canSelectMatching}
			<Button variant="link" size="sm" onclick={() => (matchingKey = matching!.key)}>
				{m.common_bulk_select_all_matching({ count: formatNumber(matching!.count) })}
			</Button>
		{/if}
		<Button variant="ghost" size="sm" onclick={clear}>
			<XIcon data-icon="inline-start" />
			{m.common_bulk_clear()}
		</Button>
		<Tooltip.Provider>
			<div class="ms-auto flex flex-wrap items-center gap-2">
				{#each buttons as state (state.action.id)}
					{@const Icon = state.action.icon}
					{@const reasonId = `${barId}-${state.action.id}`}
					<Tooltip.Root disabled={!state.disabled}>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant={state.action.destructive ? "destructive" : "outline"}
									size="sm"
									aria-disabled={state.disabled || busy ? "true" : undefined}
									aria-describedby={state.disabled ? reasonId : undefined}
									class="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
									onclick={() => start(state)}
								>
									{#if Icon}
										<Icon data-icon="inline-start" />
									{/if}
									{state.action.label()}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{state.disabled}</Tooltip.Content>
					</Tooltip.Root>
					{#if state.disabled}
						<span id={reasonId} class="sr-only">{state.disabled}</span>
					{/if}
				{/each}
				{#if menu.length}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="outline" size="sm" disabled={busy}>
									{m.common_bulk_more_actions()}
									<ChevronDownIcon data-icon="inline-end" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="min-w-52">
							{#each menu as state (state.action.id)}
								{@const Icon = state.action.icon}
								<DropdownMenu.Item
									disabled={!!state.disabled}
									variant={state.action.destructive ? "destructive" : "default"}
									onclick={() => start(state)}
								>
									{#if Icon}
										<Icon />
									{/if}
									<div class="flex flex-col">
										<span>{state.action.label()}</span>
										{#if state.disabled}
											<span class="text-xs text-muted-foreground">{state.disabled}</span>
										{/if}
									</div>
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
			</div>
		</Tooltip.Provider>
	</div>
{/if}

<!-- Anew each time it asks, without the last choice. -->
{#key asking}
	{#if asking}
		<BulkActionDialog
			action={asking.action}
			bind:open={dialogOpen}
			{count}
			applies={allMatching ? count : asking.applies.length}
			{busy}
			onrun={(value) => run(asking!.action, value)}
		/>
	{/if}
{/key}
