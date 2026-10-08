<!--
	@component
	A data table over a few jobs with a selection column and the bulk action bar, for
	`bulk-action-bar.svelte.spec.ts`. Its state isn't kept in the URL.
-->
<script lang="ts" module>
	export interface Job {
		id: number;
		name: string;
		status: "open" | "done";
	}
</script>

<script lang="ts">
	import { renderComponent } from "@tanstack/svelte-table";

	import BulkActionBar from "./bulk-action-bar.svelte";
	import type { BulkAction } from "./bulk-actions.js";
	import { createAppColumnHelper, createAppTable } from "./table.svelte.js";

	let {
		jobs,
		actions,
		matching,
		pageSize = 10,
	}: {
		jobs: Job[];
		actions: BulkAction<Job, any>[];
		/** As for a server-side table: all the rows that match. */
		matching?: { where?: unknown; key: string; count: number };
		pageSize?: number;
	} = $props();

	const column = createAppColumnHelper<Job>();
	const columns = column.columns([
		column.display({
			id: "select",
			header: ({ header }) => renderComponent(header.SelectAllHeader),
			cell: ({ cell }) => renderComponent(cell.SelectCell),
			enableSorting: false,
			enableHiding: false,
		}),
		column.accessor("name", { meta: { label: "Name" } }),
		column.accessor("status", { meta: { label: "Status" } }),
	]);

	// The page size, read once.
	// svelte-ignore state_referenced_locally
	const table = createAppTable({
		columns,
		get data() {
			return jobs;
		},
		getRowId: (row) => String(row.id),
		urlState: false,
		initialState: { pagination: { pageIndex: 0, pageSize } },
	});
</script>

<Toaster />
<table.AppTable>
	<table.Table />
	<BulkActionBar {actions} {matching} />
</table.AppTable>
