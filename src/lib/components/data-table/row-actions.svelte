<!--
	@component
	A row's action menu: open, edit, and copy actions for identifiers.

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
