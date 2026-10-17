<script lang="ts">
	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import {
		scrollPages,
		serverTableLoading,
	} from "#lib/components/data-table/server-table.svelte.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
	import { noneToken } from "#lib/components/data-table/url-state.ts";

	import type { getProgrammeOverview } from "../overview.remote.ts";
	import { columns } from "./columns.ts";
	import { partnersList } from "./partners-list.ts";
	import { getPartners } from "./partners.remote.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		partners,
		levels,
		overview,
	}: {
		/** The first page of partners, as the URL says, and how many match in all. */
		partners: Awaited<ReturnType<typeof getPartners>>;
		/** The year's levels, lowest first. */
		levels: string[];
		/** How many partners each level has (for the level filter's counts). */
		overview: Awaited<ReturnType<typeof getProgrammeOverview>>;
	} = $props();

	const pages = scrollPages({ first: () => partners, fetch: getPartners });

	const table = createAppTable({
		columns,
		serverSide: true,
		scroll: pages,
		get data() {
			return pages.rows;
		},
		get rowCount() {
			return pages.rowCount;
		},
		getRowId: (row) => String(row.id),
		initialState: { ...partnersList.urlSpec.defaults },
	});

	const loading = serverTableLoading(table, partnersList, () => pages.key);

	const levelOptions = $derived(
		levels.toReversed().map((level) => ({ value: level, label: level })),
	);
	const levelCounts = $derived(
		Object.fromEntries(overview.levels.map((each) => [each.level ?? noneToken, each.count])),
	);
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<table.Toolbar searchLabel={m.partners_search()}>
			<FacetedFilter
				columnId="level"
				title={m.partners_column_level()}
				options={levelOptions}
				counts={levelCounts}
				none={m.partners_no_level()}
			/>
		</table.Toolbar>
		<table.Table emptyTitle={m.partners_empty()} fillViewport loading={loading.current} />
	</div>
</table.AppTable>
