<!--
	@component
	The Connect page's units, worst first: the KPI tiles (the units in care and how many of each
	status, for the chosen customer), the customer chips, "only units that need attention", and the
	server-side table. The tiles, chips and checkbox set the table's filters, which are in the URL.
-->
<script lang="ts">
	import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import WrenchIcon from "@lucide/svelte/icons/wrench";
	import { type Component, untrack } from "svelte";

	import ListLayout from "#lib/components/data-table/list-layout.svelte";
	import { createServerTable } from "#lib/components/data-table/server-table.svelte.ts";
	import FilterChips from "#lib/components/filter-chips.svelte";
	import StatTile, { type StatTone } from "#lib/components/stat-tile.svelte";
	import { formatNumber } from "#lib/i18n/index.ts";

	import { needsAttention, type UnitStatus, unitStatuses } from "../model.ts";
	import { columns } from "./columns.ts";
	import {
		getConditionCustomerOptions,
		type getConditionCounts,
		getConditionUnits,
	} from "./units-list.remote.ts";
	import { conditionList, scoreBands } from "./units-list.ts";

	// The table is created here rather than in the page because making the table sets context,
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

	// Worst first: the default the server has too.
	const list = createServerTable({
		list: conditionList,
		first: () => units,
		fetch: getConditionUnits,
		columns,
		initialState: {
			// The other modules' columns, while the tenant has them (which a page's data doesn't change).
			columnVisibility: untrack(() => ({
				inspection: units.has.inspection,
				nextDue: units.has.nextDue,
			})),
		},
	});
	const { table } = list;

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
	const tiles = $derived<
		{ status: UnitStatus; label: string; icon: Component<{ class?: string }>; tone: StatTone }[]
	>([
		{
			status: "critical",
			label: m.condition_kpi_critical(),
			icon: ShieldAlertIcon,
			tone: "danger",
		},
		{
			status: "attention",
			label: m.condition_kpi_attention(),
			icon: TriangleAlertIcon,
			tone: "warning",
		},
		{
			status: "planned",
			label: m.condition_kpi_planned(),
			icon: CalendarClockIcon,
			tone: "info",
		},
		{ status: "ok", label: m.condition_kpi_ok(), icon: CircleCheckIcon, tone: "success" },
	]);
	/** The chips: the customers with the most units, and the chosen one. */
	const CHIPS = 10;
	const chips = $derived(
		counts.customers
			.filter((chip, i) => i < CHIPS || customers.includes(chip.code))
			.map((chip) => ({ value: chip.code, label: chip.name, count: chip.count })),
	);
	/** Every customer's units, for "All customers". */
	const everyone = $derived(counts.customers.reduce((sum, chip) => sum + chip.count, 0));

	const bandOptions = $derived([
		{ value: "low", label: m.condition_band_low() },
		{ value: "fair", label: m.condition_band_fair() },
		{ value: "good", label: m.condition_band_good() },
		{ value: "none", label: m.condition_band_none() },
	] satisfies { value: (typeof scoreBands)[number]; label: string }[]);
</script>

{#snippet header()}
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5" data-kpis>
		<div data-kpi="units" class="contents">
			<StatTile label={m.condition_kpi_units()} value={formatNumber(total)} icon={WrenchIcon} />
		</div>
		{#each tiles as tile (tile.status)}
			<div data-kpi={tile.status} class="contents">
				<StatTile
					label={tile.label}
					value={formatNumber(counts.status[tile.status] ?? 0)}
					icon={tile.icon}
					tone={tile.tone}
				>
					{#snippet action()}
						<Button
							variant={statuses.length === 1 && statuses[0] === tile.status ? "secondary" : "ghost"}
							size="xs"
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
				</StatTile>
			</div>
		{/each}
	</div>

	<div class="flex flex-col gap-3">
		<!-- One customer at a time; several chosen in the Customer filter press none. -->
		<FilterChips
			label={m.condition_customers_label()}
			options={chips}
			value={customers.length === 0 ? null : customers.length === 1 ? customers[0] : ""}
			all={{ label: m.condition_customers_all(), count: everyone }}
			onchange={(code) => setFilter("customer", code ? [code] : [])}
		/>
		<Label class="flex w-fit items-center gap-2 text-sm font-normal">
			<Checkbox
				checked={onlyAttention}
				onCheckedChange={(checked) => setFilter("status", checked ? [...needsAttention] : [])}
			/>
			{m.condition_only_attention()}
		</Label>
	</div>
{/snippet}

<ListLayout
	table={list}
	{header}
	facets={{ status: counts.status, condition: counts.condition }}
	searchLabel={m.condition_search()}
	emptyTitle={m.condition_empty()}
	filters={{
		condition: { options: bandOptions },
		customer: {
			load: getConditionCustomerOptions,
			searchLabel: m.common_table_search_customers(),
		},
	}}
/>
