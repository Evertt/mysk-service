<!--
	@component
	The Connect page's units, worst first: the KPI tiles (the units in care and how many of each
	status, for the chosen customer), the customer chips, "only units that need attention", and the
	server-side table. The tiles, chips and checkbox set the table's filters, which are in the URL.
-->
<script lang="ts">
	import { untrack } from "svelte";

	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import { getCustomerOptions } from "#lib/components/data-table/filter-options.remote.ts";
	import RecordFilter from "#lib/components/data-table/record-filter.svelte";
	import {
		scrollPages,
		serverTableLoading,
	} from "#lib/components/data-table/server-table.svelte.ts";
	import { createAppTable } from "#lib/components/data-table/table.svelte.ts";
	import StatCard from "#lib/components/stat-card.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { conditionLabels } from "../labels.ts";
	import { needsAttention, type UnitStatus, unitStatuses } from "../model.ts";
	import { columns } from "./columns.ts";
	import { type getConditionCounts, getConditionUnits } from "./units-list.remote.ts";
	import { conditionList, scoreBands } from "./units-list.ts";

	// The table is created here rather than in the page because `createAppTable` sets context,
	// which Svelte doesn't allow after the page's `await`.
	let {
		units,
		counts,
	}: {
		/** The first page of units, as the URL says, and how many match in all. */
		units: Awaited<ReturnType<typeof getConditionUnits>>;
		/** How many units have each status, band and customer. */
		counts: Awaited<ReturnType<typeof getConditionCounts>>;
	} = $props();

	const pages = scrollPages({ first: () => units, fetch: getConditionUnits });

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
		initialState: {
			// Worst first: the default the server has too.
			...conditionList.urlSpec.defaults,
			// The other modules' columns, while the tenant has them (which a page's data doesn't change).
			columnVisibility: untrack(() => ({
				inspection: units.has.inspection,
				nextDue: units.has.nextDue,
			})),
		},
	});

	const loading = serverTableLoading(table, conditionList, () => pages.key);

	const filterOf = (id: "status" | "customer") =>
		(table.getColumn(id)?.getFilterValue() as string[] | undefined) ?? [];
	const statuses = $derived(filterOf("status"));
	const customers = $derived(filterOf("customer"));
	const onlyAttention = $derived(
		statuses.length === needsAttention.length &&
			needsAttention.every((status) => statuses.includes(status)),
	);

	const setFilter = (id: "status" | "customer", values: string[]) =>
		table.getColumn(id)?.setFilterValue(values.length ? values : undefined);

	const total = $derived(
		unitStatuses.reduce((sum, status) => sum + (counts.status[status] ?? 0), 0),
	);
	const tiles = $derived<{ status: UnitStatus; label: string }[]>([
		{ status: "critical", label: m.condition_kpi_critical() },
		{ status: "attention", label: m.condition_kpi_attention() },
		{ status: "planned", label: m.condition_kpi_planned() },
		{ status: "ok", label: m.condition_kpi_ok() },
	]);
	/** The chips: the customers with the most units, and the chosen one. */
	const CHIPS = 10;
	const chips = $derived(
		counts.customers.filter((chip, i) => i < CHIPS || customers.includes(chip.code)),
	);

	const statusOptions = $derived(conditionLabels.labelOptions("unitStatus", unitStatuses));
	const bandOptions = $derived([
		{ value: "low", label: m.condition_band_low() },
		{ value: "fair", label: m.condition_band_fair() },
		{ value: "good", label: m.condition_band_good() },
		{ value: "none", label: m.condition_band_none() },
	] satisfies { value: (typeof scoreBands)[number]; label: string }[]);
</script>

<table.AppTable>
	<div class="flex min-h-0 flex-col gap-4">
		<div class="grid gap-4 sm:grid-cols-3 xl:grid-cols-5" data-kpis>
			<div data-kpi="units" class="contents">
				<StatCard label={m.condition_kpi_units()} value={formatNumber(total)} size="small" />
			</div>
			{#each tiles as tile (tile.status)}
				<div data-kpi={tile.status} class="contents">
					<StatCard
						label={tile.label}
						value={formatNumber(counts.status[tile.status] ?? 0)}
						size="small"
					>
						{#snippet action()}
							<Button
								variant={statuses.length === 1 && statuses[0] === tile.status
									? "secondary"
									: "ghost"}
								size="sm"
								aria-pressed={statuses.length === 1 && statuses[0] === tile.status}
								onclick={() =>
									setFilter(
										"status",
										statuses.length === 1 && statuses[0] === tile.status ? [] : [tile.status],
									)}
							>
								{m.common_view()}
							</Button>
						{/snippet}
					</StatCard>
				</div>
			{/each}
		</div>

		<div class="flex flex-col gap-3">
			<div
				class="flex flex-wrap items-center gap-2"
				role="group"
				aria-label={m.condition_customers_label()}
				data-chips
			>
				<Button
					variant={customers.length ? "outline" : "secondary"}
					size="sm"
					class="rounded-full"
					aria-pressed={!customers.length}
					onclick={() => setFilter("customer", [])}
				>
					{m.condition_customers_all()}
				</Button>
				{#each chips as chip (chip.code)}
					{@const chosen = customers.length === 1 && customers[0] === chip.code}
					<Button
						variant={chosen ? "secondary" : "outline"}
						size="sm"
						class="rounded-full"
						aria-pressed={chosen}
						data-chip={chip.code}
						onclick={() => setFilter("customer", chosen ? [] : [chip.code])}
					>
						{chip.name}
						<span class="text-muted-foreground tabular-nums">{formatNumber(chip.count)}</span>
					</Button>
				{/each}
			</div>
			<Label class="flex w-fit items-center gap-2 text-sm font-normal">
				<Checkbox
					checked={onlyAttention}
					onCheckedChange={(checked) => setFilter("status", checked ? [...needsAttention] : [])}
				/>
				{m.condition_only_attention()}
			</Label>
		</div>

		<table.Toolbar searchLabel={m.condition_search()}>
			<FacetedFilter
				columnId="status"
				title={m.condition_column_status()}
				options={statusOptions}
				counts={counts.status}
			/>
			<FacetedFilter
				columnId="condition"
				title={m.condition_column_condition()}
				options={bandOptions}
				counts={counts.condition}
			/>
			<RecordFilter
				columnId="customer"
				title={m.condition_column_customer()}
				searchLabel={m.common_table_search_customers()}
				load={getCustomerOptions}
			/>
		</table.Toolbar>
		<table.Table emptyTitle={m.condition_empty()} fillViewport loading={loading.current} />
	</div>
</table.AppTable>
