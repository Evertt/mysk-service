<!--
	@component
	Menu to show and hide the table's hideable columns, to group the rows by a column (see
	`grouping.ts`) and expand or collapse the groups, and to choose the tables' density.
-->
<script lang="ts">
	import Settings2Icon from "@lucide/svelte/icons/settings-2";

	import { densities, parseDensity, tableDensity } from "./density.svelte.js";
	import { columnLabel } from "./features.js";
	import { groupExpansion } from "./group-expansion.svelte.js";
	import { useTableContext } from "./table.svelte.js";

	const table = useTableContext();
	const columns = $derived(
		table.getAllLeafColumns().filter((column) => column.accessorFn && column.getCanHide()),
	);
	const groupable = $derived(table.getAllLeafColumns().filter((column) => column.getCanGroup()));
	/** The column the rows are grouped by, or `""` for none. */
	const groupedBy = $derived(table.atoms.grouping.get()[0] ?? "");
	const expansion = groupExpansion(table);

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
		{#if groupable.length}
			<DropdownMenu.Separator />
			<DropdownMenu.Group>
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger>{m.common_table_group_by()}</DropdownMenu.SubTrigger>
					<DropdownMenu.SubContent class="w-44">
						<DropdownMenu.RadioGroup
							value={groupedBy}
							onValueChange={(value) => table.setGrouping(value ? [value] : [])}
						>
							<DropdownMenu.RadioItem value="" closeOnSelect={false}>
								{m.common_table_group_none()}
							</DropdownMenu.RadioItem>
							{#each groupable as column (column.id)}
								<DropdownMenu.RadioItem value={column.id} closeOnSelect={false}>
									{columnLabel(column)}
								</DropdownMenu.RadioItem>
							{/each}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
				{#if groupedBy}
					<DropdownMenu.Item onSelect={() => expansion.setAll(groupedBy, false)}>
						{m.common_table_group_expand_all()}
					</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={() => expansion.setAll(groupedBy, true)}>
						{m.common_table_group_collapse_all()}
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Group>
		{/if}
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
