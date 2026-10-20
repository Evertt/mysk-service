<!--
	@component
	The work orders page's list of assets (the mockup's left column): the search ("Zoek asset…"), a
	customer to keep to and where they stand this year, then each unit with its customer and site and
	its badge of this year ("2026 ✓", "2026 open"), and under it its components with their latest
	score. Each is a link that selects it (`?unit=`, `&component=`), keeping the list's place. The
	server searches, filters and pages; more rows load as the list scrolls to its end.
-->
<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import SearchIcon from "@lucide/svelte/icons/search";
	import { useDebounce } from "runed";
	import { untrack } from "svelte";

	import { scrollPages } from "#lib/components/data-table/server-table.svelte.ts";
	import FilterChips from "#lib/components/filter-chips.svelte";
	import { unitTitle } from "#lib/equipment/index.ts";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { checklistLabels } from "../labels.ts";
	import { yearStates } from "../model.ts";
	import { type getAssetFacets, getAssets } from "./assets.remote.ts";
	import { pageHref } from "./selection.ts";
	import YearBadge from "./year-badge.svelte";

	let {
		assets,
		facets,
		year,
	}: {
		/** The first page of assets, as the URL says, and how many match in all. */
		assets: Awaited<ReturnType<typeof getAssets>>;
		/** How many match by where they stand this year, and by customer. */
		facets: Awaited<ReturnType<typeof getAssetFacets>>;
		/** This year. */
		year: number;
	} = $props();

	const pages = scrollPages({ first: () => assets, fetch: getAssets });

	const params = $derived(page.url.searchParams);
	const selectedUnit = $derived(params.get("unit"));
	const selectedComponent = $derived(params.get("component"));
	const customerCode = $derived(params.get("customer") ?? "");
	const yearFilter = $derived(params.get("year") ?? "");

	/** Goes to the page with `changes` to its parameters, in place: the list's state. */
	function change(changes: Record<string, string | null>) {
		void goto(pageHref(page.url, { ...changes, row: null }), {
			replace: true,
			reset: false,
		});
	}

	// The search box, as the page opened: the URL follows a moment after typing stops.
	let search = $state(untrack(() => page.url.searchParams.get("q") ?? ""));
	const searchFor = useDebounce(() => change({ q: search.trim() || null }), 300);

	const chips = $derived(
		yearStates.map((state) => ({
			value: state,
			label: checklistLabels.label("yearState", state),
			count: facets.thisYear[state] ?? 0,
			href: pageHref(page.url, { year: state, row: null }),
		})),
	);

	/**
	 * Loads more rows as the end of the list comes into view; anew once they're in, in case it still
	 * is (an observer only tells of a change).
	 */
	function nearEnd(sentinel: HTMLElement) {
		void pages.rows.length;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) pages.loadMore();
			},
			{ root: sentinel.closest("[data-asset-scroll]"), rootMargin: "200px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}
</script>

<aside class="flex min-w-0 flex-col rounded-lg border bg-card" data-asset-list>
	<div class="flex flex-col gap-3 border-b p-3">
		<InputGroup.Root>
			<InputGroup.Addon>
				<SearchIcon />
			</InputGroup.Addon>
			<InputGroup.Input
				type="search"
				bind:value={search}
				oninput={() => void searchFor()}
				placeholder={m.checklists_assets_search()}
				aria-label={m.checklists_assets_search_label()}
			/>
		</InputGroup.Root>
		<NativeSelect.Root
			value={customerCode}
			onchange={(event) => change({ customer: event.currentTarget.value || null })}
			aria-label={m.checklists_assets_customer_label()}
			class="w-full"
		>
			<NativeSelect.Option value="">{m.checklists_assets_customer_all()}</NativeSelect.Option>
			{#each facets.customers as option (option.code)}
				<NativeSelect.Option value={option.code}>
					{option.name} ({formatNumber(option.count)})
				</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>
		<!-- Links in place: the list's state, as `change()` keeps it. -->
		<FilterChips
			label={m.checklists_assets_year_label()}
			options={chips}
			value={yearFilter || null}
			all={{
				label: m.checklists_assets_year_all(),
				href: pageHref(page.url, { year: null, row: null }),
			}}
			class="gap-1.5"
			data-year-filter
			data-sveltekit-replacestate
			data-sveltekit-reset="false"
		/>
		<p class="text-xs text-muted-foreground" data-asset-count>
			{m.checklists_assets_count({ count: pages.rowCount })}
		</p>
	</div>

	<div class="max-h-[45svh] overflow-y-auto lg:max-h-[70svh]" data-asset-scroll>
		{#if pages.rows.length}
			<ul class="flex flex-col divide-y">
				{#each pages.rows as asset (asset.id)}
					{@const unitCurrent = selectedUnit === asset.serialNumber && !selectedComponent}
					<li data-asset={asset.serialNumber}>
						<a
							href={pageHref(page.url, {
								unit: asset.serialNumber,
								component: null,
								checklist: null,
							})}
							class="flex flex-col gap-0.5 px-4 py-3 text-sm hover:bg-muted/50 aria-[current=true]:bg-primary/10"
							aria-current={unitCurrent ? "true" : undefined}
							data-sveltekit-reset="false"
						>
							<span class="flex items-start justify-between gap-2">
								<span class="min-w-0 font-medium">{unitTitle(asset)}</span>
								<YearBadge state={asset.thisYear} {year} />
							</span>
							<span class="truncate text-xs text-muted-foreground">
								{asset.serialNumber} · {asset.customer.name} · {asset.site}
							</span>
						</a>
						{#if asset.components.length}
							<ul
								class="flex flex-col pb-2"
								aria-label={m.checklists_assets_components({ unit: unitTitle(asset) })}
							>
								{#each asset.components as part (part.id)}
									{@const current =
										selectedUnit === asset.serialNumber && selectedComponent === part.number}
									<li>
										<a
											href={pageHref(page.url, {
												unit: asset.serialNumber,
												component: part.number,
												checklist: null,
											})}
											class="flex items-center justify-between gap-2 py-1 pr-4 pl-8 text-xs hover:bg-muted/50 aria-[current=true]:bg-primary/10"
											aria-current={current ? "true" : undefined}
											data-sveltekit-reset="false"
											data-component={part.number}
										>
											<span class="min-w-0 truncate">
												<span class="text-muted-foreground tabular-nums">{part.number}</span>
												{part.name}
											</span>
											<span class="shrink-0 text-muted-foreground tabular-nums" data-score>
												{part.score === null
													? m.checklists_no_score()
													: m.checklists_score({ score: formatNumber(part.score) })}
											</span>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
			{#if pages.more}
				<div {@attach nearEnd} class="p-3 text-center text-xs text-muted-foreground">
					{m.checklists_assets_loading_more()}
				</div>
			{/if}
		{:else}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Title>{m.checklists_assets_empty_title()}</Empty.Title>
					<Empty.Description>{m.checklists_assets_empty_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</div>
</aside>
