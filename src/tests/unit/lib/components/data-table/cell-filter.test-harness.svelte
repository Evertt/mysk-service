<!--
	@component
	A data table of a few sites, for `cell-filter.svelte.spec.ts`: a status column whose values
	filter it when clicked (`meta.clickFilter`), a location whose city goes in the search box and
	whose country filters its own column, and a name that links to the site's page.
-->
<script lang="ts" module>
	export interface Site {
		id: number;
		name: string;
		status: "open" | "closed" | null;
		city: string;
		country: string;
	}
</script>

<script lang="ts">
	import { renderComponent } from "@tanstack/svelte-table";

	import FacetedFilter from "#lib/components/data-table/faceted-filter.svelte";
	import {
		createAppColumnHelper,
		createAppTable,
	} from "#lib/components/data-table/table.svelte.ts";
	import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";

	let { sites }: { sites: Site[] } = $props();

	const statusLabels: Record<string, string> = { open: "Open", closed: "Closed" };
	const countryNames: Record<string, string> = { NL: "Netherlands", BE: "Belgium" };

	const column = createAppColumnHelper<Site>();
	const columns = column.columns([
		column.accessor("name", {
			cell: ({ row }) =>
				renderComponent(TwoLineCell, {
					primary: row.original.name,
					href: `/sites/${row.original.id}`,
				}),
			meta: { label: "Name" },
		}),
		column.accessor("status", {
			filterFn: "oneOf",
			meta: {
				label: "Status",
				filterValues: ["open", "closed"],
				clickFilter: (status) => statusLabels[status],
			},
		}),
		column.accessor("country", {
			cell: ({ row }) =>
				renderComponent(TwoLineCell, {
					primary: row.original.city,
					secondary: countryNames[row.original.country],
					primaryFilter: { value: row.original.city, label: row.original.city, search: true },
					secondaryFilter: {
						value: row.original.country,
						label: countryNames[row.original.country],
					},
				}),
			filterFn: "oneOf",
			meta: { label: "Location" },
		}),
		// Hidden: lets the search find the sites by city.
		column.accessor("city", { enableHiding: false }),
	]);

	const table = createAppTable({
		columns,
		get data() {
			return sites;
		},
		getRowId: (row) => String(row.id),
		initialState: { columnVisibility: { city: false } },
	});
</script>

<table.AppTable>
	<table.Toolbar searchLabel="Search sites…">
		<FacetedFilter
			columnId="status"
			title="Status"
			options={[
				{ value: "open", label: "Open" },
				{ value: "closed", label: "Closed" },
			]}
		/>
	</table.Toolbar>
	<table.Table emptyTitle="No sites found" />
</table.AppTable>
