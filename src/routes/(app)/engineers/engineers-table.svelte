<script lang="ts">
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";
	import { specialtyOptions } from "#lib/components/engineers/display.js";

	import { columns, type EngineerRow } from "./columns.js";
	import { engineerRegions } from "./engineer-schema.js";

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
	const regionOptions = $derived(
		[...new Set([...engineerRegions, ...engineers.map((row) => row.region)])].map((value) => ({
			value,
			label: value,
		})),
	);
	const statusOptions = [
		{ value: "active", label: "Active" },
		{ value: "inactive", label: "Inactive" },
	];
</script>

<table.AppTable>
	<div class="flex flex-col gap-4">
		<table.Toolbar searchLabel="Search engineers…">
			<FacetedFilter columnId="specialty" title="Specialty" options={specialtyOptions} />
			<FacetedFilter columnId="region" title="Region" options={regionOptions} />
			<FacetedFilter columnId="status" title="Status" options={statusOptions} />
		</table.Toolbar>
		<table.Table emptyTitle="No engineers found" />
		<table.Pagination />
	</div>
</table.AppTable>
