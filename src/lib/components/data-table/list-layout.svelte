<!--
	@component
	A list's table on its page: whatever goes above it (`header`, in the table's context, e.g. chips
	that set its filters), its toolbar with the filters from the list's definition (`ListToolbar`,
	given `facets`, `filters`, `searchLabel` and `tools`, the toolbar's own actions), the rows
	(filling the viewport, dimmed while a server-side table waits for rows, with its groups), and the
	bulk action bar when there are `actions` (with "select all matching" on a server-side table).
	`table` is the list's table, `createServerTable()`'s or `createClientTable()`'s.

	```svelte
	<ListLayout
		{table}
		{facets}
		searchLabel={m.orders_search()}
		emptyTitle={m.orders_empty()}
		filters={{ customer: { load: getOrderCustomerOptions, searchLabel: … } }}
		actions={[assignEngineer, deleteOrders]}
	/>
	```
-->
<script lang="ts" generics="TData extends RowData, C extends ListColumns, Where = never">
	import type { RowData } from "@tanstack/svelte-table";
	import type { Snippet } from "svelte";

	import BulkActionBar from "./bulk-action-bar.svelte";
	import type { BulkAction } from "./bulk-actions.ts";
	import type { ListColumns } from "./list-definition.ts";
	import ListToolbar, { type ListToolbarProps } from "./list-toolbar.svelte";
	import type { ListTable } from "./table.svelte.ts";

	type Props = Omit<ListToolbarProps<C>, "list" | "actions" | "children"> & {
		table: ListTable<TData, C>;
		/** What the table shows without rows. */
		emptyTitle: string;
		/**
		 * Its bulk actions, if it has any: on a server-side list, also on all the rows that match
		 * (their `where`).
		 */
		actions?: BulkAction<TData, Where>[];
		/** Above the toolbar, in the table's context. */
		header?: Snippet;
		/** The toolbar's own actions, e.g. a select of the page's. */
		tools?: Snippet;
		/** After the toolbar's filters. */
		children?: Snippet;
	};

	let {
		table: listTable,
		emptyTitle,
		actions,
		header,
		tools,
		children,
		...toolbar
	}: Props = $props();

	// The table, which doesn't change while the component lives.
	const table = $derived(listTable.table);
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-1 flex-col gap-4">
		{@render header?.()}
		<ListToolbar
			{...{ ...toolbar, list: listTable.list, actions: tools } as unknown as ListToolbarProps<C>}
		>
			{@render children?.()}
		</ListToolbar>
		<table.Table {emptyTitle} fillViewport loading={listTable.loading} groups={listTable.groups} />
		{#if actions?.length}
			<BulkActionBar
				{actions}
				matching={listTable.matching as { where: Where; key: string; count: number } | undefined}
			/>
		{/if}
	</div>
</table.AppTable>
