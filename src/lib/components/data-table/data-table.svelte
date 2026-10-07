<!--
	@component
	The table itself: headers, the current page of rows, and an empty state.
-->
<script lang="ts">
	import { useTheme } from "#lib/themes/context.js";
	import { cn } from "#lib/utils.js";

	import { useTableContext } from "./table.svelte.js";

	let {
		emptyTitle = m.common_table_empty_title(),
		emptyDescription = m.common_table_empty_description(),
	}: { emptyTitle?: string; emptyDescription?: string } = $props();

	const table = useTableContext();
	const theme = useTheme();
</script>

<div
	data-slot="data-table"
	class={cn("overflow-hidden rounded-lg border", theme.classes("data-table"))}
>
	<Table.Root>
		<Table.Header>
			{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<Table.Row>
					{#each headerGroup.headers as header (header.id)}
						<table.AppHeader {header}>
							{#snippet children(h)}
								<Table.Head class={cn(h.column.id === "select" && "w-10")}>
									{#if !h.isPlaceholder}
										<h.FlexRender header={h} />
									{/if}
								</Table.Head>
							{/snippet}
						</table.AppHeader>
					{/each}
				</Table.Row>
			{/each}
		</Table.Header>
		<Table.Body>
			{#each table.getRowModel().rows as row (row.id)}
				<Table.Row data-state={row.getIsSelected() ? "selected" : undefined}>
					{#each row.getVisibleCells() as cell (cell.id)}
						<table.AppCell {cell}>
							{#snippet children(c)}
								<Table.Cell>
									<c.FlexRender cell={c} />
								</Table.Cell>
							{/snippet}
						</table.AppCell>
					{/each}
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={table.getVisibleLeafColumns().length}>
						<Empty.Root>
							<Empty.Header>
								<Empty.Title>{emptyTitle}</Empty.Title>
								<Empty.Description>{emptyDescription}</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
