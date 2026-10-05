<script lang="ts">
	import SearchIcon from "@lucide/svelte/icons/search";
	import XIcon from "@lucide/svelte/icons/x";

	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { priorityOptions, statusOptions, typeOptions } from "#lib/components/orders/display.js";
	import { cn } from "#lib/utils.js";

	import type { PageProps } from "./$types";
	import { columns } from "./columns.js";

	let { data }: PageProps = $props();

	const table = createAppTable({
		columns,
		get data() {
			return data.orders;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "createdAt", desc: true }],
			columnVisibility: { createdAt: false },
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});

	const globalFilter = $derived(table.atoms.globalFilter.get() ?? "");
	const isFiltered = $derived(table.atoms.columnFilters.get().length > 0 || globalFilter !== "");
</script>

<svelte:head>
	<title>Orders</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold tracking-tight">Orders</h1>
	<p class="text-muted-foreground">Work orders across all customers and engineers.</p>
</div>

<table.AppTable>
	<div class="flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-2">
			<InputGroup.Root class="w-full sm:w-64">
				<InputGroup.Addon>
					<SearchIcon />
				</InputGroup.Addon>
				<InputGroup.Input
					placeholder="Search orders…"
					aria-label="Search orders"
					value={globalFilter}
					oninput={(event) => table.setGlobalFilter(event.currentTarget.value)}
				/>
			</InputGroup.Root>
			<FacetedFilter columnId="status" title="Status" options={statusOptions} />
			<FacetedFilter columnId="type" title="Type" options={typeOptions} />
			<FacetedFilter columnId="priority" title="Priority" options={priorityOptions} />
			{#if isFiltered}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						table.resetColumnFilters();
						table.resetGlobalFilter();
					}}
				>
					Reset
					<XIcon data-icon="inline-end" />
				</Button>
			{/if}
			<div class="ml-auto">
				<table.ViewOptions />
			</div>
		</div>

		<div class="overflow-hidden rounded-lg border">
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
										<Empty.Title>No orders found</Empty.Title>
										<Empty.Description>
											Try a different search or clear the filters.
										</Empty.Description>
									</Empty.Header>
								</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<table.Pagination />
	</div>
</table.AppTable>
