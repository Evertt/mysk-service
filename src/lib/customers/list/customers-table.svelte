<script lang="ts">
	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { createClientTable } from "#lib/components/data-table/table.svelte.ts";

	import { countryOptions } from "../countries.ts";
	import { deleteCustomers } from "./bulk-actions.ts";
	import { columns, type CustomerRow } from "./columns.ts";
	import { customersList } from "./customers-list.ts";

	// The table is created here rather than in the page because making the table sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { customers }: { customers: CustomerRow[] } = $props();

	const table = createClientTable({
		list: customersList,
		data: () => customers,
		columns,
		initialState: { columnVisibility: { createdAt: false, search: false } },
	});
</script>

<ListLayout
	{table}
	actions={[deleteCustomers]}
	searchLabel={m.customers_search()}
	emptyTitle={m.customers_empty()}
	filters={{
		country: {
			title: m.customers_column_country(),
			options: countryOptions(customers.map((customer) => customer.country)),
		},
		equipmentCount: { step: 1, min: 0 },
		openOrders: { step: 1, min: 0 },
		createdAt: { presets: ["this-week", "this-month", "last-30-days", "this-year", "last-year"] },
	}}
/>
