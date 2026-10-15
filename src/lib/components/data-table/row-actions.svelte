<!--
	@component
	A row's action menu: open, edit, the table's bulk actions that apply to the row, and copy
	actions for identifiers.

	The bulk actions are those of the table's action bar (`bulk-action-bar.svelte`, the core's and
	the tenant's modules'), run on this row alone (see `row-bulk-actions.svelte.ts`); the bar asks
	first and says how it went, as for a selection. In a table without an action bar, there are none.

	A list shows one on every row, and a dropdown menu is a lot to set up a hundred times for menus
	that are mostly never opened: until the pointer or the focus reaches it, the row has a plain
	button that looks the same, which makes way for the menu's own trigger then (keeping the focus).
	A tap that lands on the plain button opens the menu.
-->
<script lang="ts">
	import CopyIcon from "@lucide/svelte/icons/copy";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import type { Attachment } from "svelte/attachments";

	import { actionsForRow, type BulkAction } from "./bulk-actions.ts";
	import { getRowBulkActions } from "./row-bulk-actions.svelte.ts";
	import { useCellContext } from "./table.svelte.ts";

	let {
		label,
		href,
		editHref,
		copy = [],
	}: {
		/** Names the row, e.g. its number or name. */
		label: string;
		href?: string;
		editHref?: string;
		copy?: { label: string; value: string }[];
	} = $props();

	/** Whether the menu is set up: once the pointer or the focus has reached the button. */
	let active = $state(false);
	let open = $state(false);
	/** The plain button had the focus, which goes to the trigger that replaces it. */
	let focused = false;

	// The table's bulk actions, in a table's cell (with the cell's row).
	const bulk = getRowBulkActions();
	const cell = bulk && useCellContext();
	/** Those that apply to the row, worked out once the menu is set up. */
	const rowActions = $derived(
		active && bulk && cell ? actionsForRow(bulk.actions, cell.row.original) : [],
	);

	function runOnRow(action: BulkAction<unknown, unknown>) {
		if (cell) bulk?.start(action, { id: cell.row.id, original: cell.row.original, label });
	}

	const takeFocus: Attachment<HTMLElement> = (element) => {
		if (focused) element.focus();
		focused = false;
	};
</script>

{#if active}
	<DropdownMenu.Root bind:open>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={m.common_table_row_actions({ label })}
					{@attach takeFocus}
				>
					<EllipsisIcon />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="min-w-44">
			<DropdownMenu.Group>
				<DropdownMenu.Label>{label}</DropdownMenu.Label>
				{#if href}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} {href}><EyeIcon />{m.common_open()}</a>
						{/snippet}
					</DropdownMenu.Item>
				{/if}
				{#if editHref}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={editHref}><PencilIcon />{m.common_edit()}</a>
						{/snippet}
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Group>
			{#if rowActions.length}
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					{#each rowActions as action (action.id)}
						{@const Icon = action.icon}
						<DropdownMenu.Item
							variant={action.destructive ? "destructive" : "default"}
							onclick={() => runOnRow(action)}
						>
							{#if Icon}
								<Icon />
							{/if}
							{action.label()}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Group>
			{/if}
			{#if copy.length}
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					{#each copy as item (item.label)}
						<DropdownMenu.Item onclick={() => navigator.clipboard.writeText(item.value)}>
							<CopyIcon />
							{item.label}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Group>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{:else}
	<Button
		variant="ghost"
		size="icon-sm"
		aria-label={m.common_table_row_actions({ label })}
		aria-haspopup="menu"
		aria-expanded="false"
		data-state="closed"
		onpointerenter={() => (active = true)}
		onfocus={() => {
			focused = true;
			active = true;
		}}
		onclick={() => {
			active = true;
			open = true;
		}}
	>
		<EllipsisIcon />
	</Button>
{/if}
