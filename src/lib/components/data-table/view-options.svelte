<!--
	@component
	Menu to show and hide the table's hideable columns.
-->
<script lang="ts">
	import Settings2Icon from "@lucide/svelte/icons/settings-2";

	import { useTableContext } from "./table.svelte.js";

	const table = useTableContext();
	const columns = $derived(
		table.getAllLeafColumns().filter((column) => column.accessorFn && column.getCanHide()),
	);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm">
				<Settings2Icon data-icon="inline-start" />
				View
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-44">
		<DropdownMenu.Group>
			<DropdownMenu.Label>Toggle columns</DropdownMenu.Label>
			<DropdownMenu.Separator />
			{#each columns as column (column.id)}
				<DropdownMenu.CheckboxItem
					checked={column.getIsVisible()}
					onCheckedChange={(value) => column.toggleVisibility(value)}
					closeOnSelect={false}
				>
					{column.columnDef.meta?.label ?? column.id}
				</DropdownMenu.CheckboxItem>
			{/each}
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
