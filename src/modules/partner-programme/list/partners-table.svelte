<script lang="ts">
	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { createServerTable } from "#lib/components/data-table/server-table.svelte.ts";
	import { noneToken } from "#lib/components/data-table/url-state.ts";

	import type { getProgrammeOverview } from "../overview.remote.ts";
	import { columns } from "./columns.ts";
	import { partnersList } from "./partners-list.ts";
	import { getPartners } from "./partners.remote.ts";

	// The table is created here rather than in the page because making the table sets context,
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

	const table = createServerTable({
		list: partnersList,
		first: () => partners,
		fetch: getPartners,
		columns,
	});

	const levelOptions = $derived(
		levels.toReversed().map((level) => ({ value: level, label: level })),
	);
	const levelCounts = $derived(
		Object.fromEntries(overview.levels.map((each) => [each.level ?? noneToken, each.count])),
	);
</script>

<ListLayout
	{table}
	facets={{ level: levelCounts }}
	searchLabel={m.partners_search()}
	emptyTitle={m.partners_empty()}
	filters={{ level: { options: levelOptions } }}
/>
