<!--
	@component
	Menu to show and hide the table's hideable columns, and to choose the tables' density.
-->
<script lang="ts">
	import Settings2Icon from "@lucide/svelte/icons/settings-2";

	import { densities, parseDensity, tableDensity } from "./density.svelte.js";
	import { columnLabel } from "./features.js";
	import { useTableContext } from "./table.svelte.js";

	const table = useTableContext();
	const columns = $derived(
		table.getAllLeafColumns().filter((column) => column.accessorFn && column.getCanHide()),
	);

	const densityLabels = {
		comfortable: m.common_table_density_comfortable,
		compact: m.common_table_density_compact,
	};
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
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<DropdownMenu.Label>{m.common_table_density()}</DropdownMenu.Label>
			<DropdownMenu.RadioGroup
				value={tableDensity.current}
				onValueChange={(value) => (tableDensity.current = parseDensity(value))}
			>
				{#each densities as density (density)}
					<DropdownMenu.RadioItem value={density} closeOnSelect={false}>
						{densityLabels[density]()}
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
