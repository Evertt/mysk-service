<script lang="ts">
	import BulkActionBar from "#lib/components/data-table/bulk-action-bar.svelte";
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import NumberRangeFilter from "#lib/components/data-table/number-range-filter.svelte";
	import { recordFacets } from "#lib/components/data-table/record-facets.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";

	import { levelOptions, statusOptions } from "../display.ts";
	import { deleteContracts } from "./bulk-actions.ts";
	import { columns, type ContractRow } from "./columns.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { contracts }: { contracts: ContractRow[] } = $props();

	const table = createAppTable({
		columns,
		get data() {
			return contracts;
		},
		getRowId: (row) => String(row.id),
		initialState: {
			sorting: [{ id: "period", desc: true }],
			columnVisibility: { createdAt: false },
			pagination: { pageIndex: 0, pageSize: 20 },
		},
	});

	const customers = $derived(
		recordFacets(table, "customer", (row) => ({
			value: row.customer.code,
			label: row.customer.name,
			detail: row.customer.code,
		})),
	);
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<table.Toolbar searchLabel={m.contracts_search()}>
			<FacetedFilter columnId="status" title={m.contracts_status()} options={statusOptions} />
			<FacetedFilter columnId="level" title={m.contracts_level()} options={levelOptions} />
			<FacetedFilter
				columnId="customer"
				title={m.contracts_customer()}
				options={customers.options}
				counts={customers.counts}
			/>
			<NumberRangeFilter columnId="monthlyFee" title={m.contracts_monthly_fee()} money min={0} />
		</table.Toolbar>
		<table.Table emptyTitle={m.contracts_empty()} fillViewport />
		<BulkActionBar actions={[deleteContracts]} />
		<table.Pagination />
	</div>
</table.AppTable>
