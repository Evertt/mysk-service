<!--
	@component
	Menu to show and hide the table's hideable columns.
-->
<script lang="ts">
	import Settings2Icon from "@lucide/svelte/icons/settings-2";

	import { columnLabel } from "./features.js";
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
				{m.common_table_view()}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-44">
		<DropdownMenu.Group>
			<DropdownMenu.Label>{m.common_table_toggle_columns()}</DropdownMenu.Label>
			<DropdownMenu.Separator />
			{#each columns as column (column.id)}
				<DropdownMenu.CheckboxItem
					checked={column.getIsVisible()}
					onCheckedChange={(value) => column.toggleVisibility(value)}
					closeOnSelect={false}
				>
					{columnLabel(column)}
				</DropdownMenu.CheckboxItem>
			{/each}
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
