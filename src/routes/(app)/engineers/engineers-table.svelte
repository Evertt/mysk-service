<script lang="ts">
	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { regionOptions, specialtyOptions } from "#lib/components/engineers/display.js";

	import { activate, deactivate } from "./bulk-actions.js";
	import { columns, type EngineerRow } from "./columns.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { engineers }: { engineers: EngineerRow[] } = $props();

	const table = createAppTable({
		columns,
		get data() {
			return engineers;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "name", desc: false }],
			columnVisibility: { email: false },
			pagination: { pageIndex: 0, pageSize: 10 },
		},
	});

	// Regions are free text, so include any outside the usual list.
	const regions = $derived(regionOptions(engineers.map((row) => row.region)));
	const statusOptions = $derived([
		{ value: "active", label: m.engineers_active() },
		{ value: "inactive", label: m.engineers_inactive() },
	]);
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<table.Toolbar searchLabel={m.engineers_search()}>
			<FacetedFilter
				columnId="specialty"
				title={m.engineers_column_specialty()}
				options={specialtyOptions}
			/>
			<FacetedFilter columnId="region" title={m.engineers_column_region()} options={regions} />
			<FacetedFilter
				columnId="status"
				title={m.engineers_column_status()}
				options={statusOptions}
			/>
		</table.Toolbar>
		<table.Table emptyTitle={m.engineers_empty()} fillViewport />
		<BulkActionBar actions={[activate, deactivate]} />
		<table.Pagination />
	</div>
</table.AppTable>
