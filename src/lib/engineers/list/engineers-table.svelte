<script lang="ts">
	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { createClientTable } from "#lib/components/data-table/table.svelte.ts";

	import { regionOptions } from "../display.ts";
	import { activate, deactivate } from "./bulk-actions.ts";
	import { columns, type EngineerRow } from "./columns.ts";
	import { engineersList } from "./engineers-list.ts";

	// The table is created here rather than in the page because making the table sets context,
	// which Svelte doesn't allow after the page's `await`.
	let { engineers }: { engineers: EngineerRow[] } = $props();

	const table = createClientTable({
		list: engineersList,
		data: () => engineers,
		columns,
		initialState: { columnVisibility: { email: false } },
	});
</script>

<ListLayout
	{table}
	actions={[activate, deactivate]}
	searchLabel={m.engineers_search()}
	emptyTitle={m.engineers_empty()}
	filters={{
		// Free text, so any outside the usual list too.
		region: { options: regionOptions(engineers.map((row) => row.region)) },
		hourlyRate: { min: 0 },
		openOrders: { step: 1, min: 0 },
		hiredAt: { presets: ["this-month", "last-30-days", "this-year", "last-year"] },
	}}
/>
