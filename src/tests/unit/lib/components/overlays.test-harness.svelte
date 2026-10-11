<!--
	@component
	One of the ui overlays, opened and closed through `open`, for `overlays.svelte.spec.ts`.
-->
<script lang="ts" module>
	export const overlays = [
		"popover",
		"dropdown-menu",
		"select",
		"tooltip",
		"dialog",
		"alert-dialog",
		"sheet",
	] as const;
	export type Overlay = (typeof overlays)[number];
</script>

<script lang="ts">
	let { overlay, open }: { overlay: Overlay; open: boolean } = $props();
</script>

{#if overlay === "popover"}
	<Popover.Root {open}>
		<Popover.Trigger>Trigger</Popover.Trigger>
		<Popover.Content>Content</Popover.Content>
	</Popover.Root>
{:else if overlay === "dropdown-menu"}
	<DropdownMenu.Root {open}>
		<DropdownMenu.Trigger>Trigger</DropdownMenu.Trigger>
		<DropdownMenu.Content>
			<DropdownMenu.Item>Item</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{:else if overlay === "select"}
	<Select.Root type="single" {open}>
		<Select.Trigger>Trigger</Select.Trigger>
		<Select.Content>
			<Select.Item value="item">Item</Select.Item>
		</Select.Content>
	</Select.Root>
{:else if overlay === "tooltip"}
	<Tooltip.Provider>
		<Tooltip.Root {open}>
			<Tooltip.Trigger>Trigger</Tooltip.Trigger>
			<Tooltip.Content>Content</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{:else if overlay === "dialog"}
	<Dialog.Root {open}>
		<Dialog.Content>
			<Dialog.Title>Title</Dialog.Title>
		</Dialog.Content>
	</Dialog.Root>
{:else if overlay === "alert-dialog"}
	<AlertDialog.Root {open}>
		<AlertDialog.Content>
			<AlertDialog.Title>Title</AlertDialog.Title>
		</AlertDialog.Content>
	</AlertDialog.Root>
{:else if overlay === "sheet"}
	<Sheet.Root {open}>
		<Sheet.Content>
			<Sheet.Title>Title</Sheet.Title>
		</Sheet.Content>
	</Sheet.Root>
{/if}
