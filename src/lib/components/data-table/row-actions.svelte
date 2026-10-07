<!--
	@component
	A row's action menu: open, edit, and copy actions for identifiers.
-->
<script lang="ts">
	import CopyIcon from "@lucide/svelte/icons/copy";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import PencilIcon from "@lucide/svelte/icons/pencil";

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
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				aria-label={m.common_table_row_actions({ label })}
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
