<script lang="ts">
	import { segmentOptions } from "#lib/components/customers/display.js";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { createAppTable } from "#lib/components/data-table/table.svelte.js";

	import { columns, type CustomerRow } from "./columns.js";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { customers }: { customers: CustomerRow[] } = $props();

	const countryOptions = $derived(
		[...new Set(customers.map((c) => c.country))]
			.sort((a, b) => a.localeCompare(b))
			.map((country) => ({ value: country, label: country })),
	);

	const table = createAppTable({
		columns,
		get data() {
			return customers;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "name", desc: false }],
			columnVisibility: { createdAt: false, search: false },
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});
</script>

<table.AppTable>
	<div class="flex flex-col gap-4">
		<table.Toolbar searchLabel="Search customers…">
			<FacetedFilter columnId="segment" title="Segment" options={segmentOptions} />
			<FacetedFilter columnId="country" title="Country" options={countryOptions} />
		</table.Toolbar>
		<table.Table emptyTitle="No customers found" />
		<table.Pagination />
	</div>
</table.AppTable>
