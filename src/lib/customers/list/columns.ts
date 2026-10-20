import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import { withListColumns } from "#lib/components/data-table/list-definition.ts";
import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { intlLocale } from "#lib/i18n/index.ts";
import { customerSegments } from "#lib/models.ts";

import { countryName } from "../countries.ts";
import type { getCustomers } from "../customers.remote.ts";
import { customerSegmentDisplay } from "../display.ts";
import CustomerLink from "../ui/customer-link.svelte";
import { customersList } from "./customers-list.ts";

export type CustomerRow = Awaited<ReturnType<typeof getCustomers>>[number];

const column = createAppColumnHelper<CustomerRow>();

export const columns = withListColumns(customersList, {
	select: column.select(),
	name: column.accessor("name", {
		cell: ({ row }) =>
			renderComponent(CustomerLink, {
				code: row.original.code,
				name: row.original.name,
				withCode: true,
			}),
		enableHiding: false,
		meta: { label: m.customers_column_customer },
	}),
	contactName: column.accessor("contactName", {
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.contactName,
				secondary: row.original.email,
			}),
		meta: { label: m.customers_column_contact },
	}),
	country: column.accessor("country", {
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.city,
				secondary: countryName(row.original.country),
				// The city has no filter of its own: it goes in the search box.
				primaryFilter: { value: row.original.city, label: row.original.city, search: true },
				secondaryFilter: {
					value: row.original.country,
					label: countryName(row.original.country),
				},
			}),
		// The search finds the city and the country as shown in the hidden `search` column, not the
		// country as stored (in English).
		enableGlobalFilter: false,
		// By country (by its name as shown), then city.
		sortFn: (a, b) =>
			countryName(a.original.country).localeCompare(
				countryName(b.original.country),
				intlLocale(),
			) || a.original.city.localeCompare(b.original.city, intlLocale()),
		// Grouped by country: the cell's city would be one customer's.
		meta: {
			label: m.customers_column_location,
			groupLabel: (country) => countryName(String(country)),
		},
	}),
	segment: column.enum("segment", {
		values: customerSegments,
		display: customerSegmentDisplay,
		// By size rather than alphabetically.
		sortByOrder: true,
		enableGlobalFilter: false,
		meta: { label: m.customers_column_segment },
	}),
	equipmentCount: column.accessor("equipmentCount", {
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		meta: { label: m.customers_column_equipment, align: "end" },
	}),
	// `?open-orders=1..`: the customers with open orders.
	openOrders: column.accessor("openOrders", {
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		meta: { label: m.customers_column_open_orders, align: "end" },
	}),
	// `?since=this-year`: the customers who joined this year.
	createdAt: column.accessor("createdAt", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.customers_column_since },
	}),
	// Hidden, and not in the column menu: lets the search box find customers by details that
	// are shown in other columns' second lines (code, email, city, the country as shown) or not
	// at all (phone).
	search: column.accessor(
		(row) => [row.code, row.email, row.city, row.phone, countryName(row.country)].join(" "),
		{ id: "search", enableHiding: false },
	),
	actions: column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.name,
				href: resolve("/(app)/customers/[code]", { code: row.original.code }),
				editHref: resolve("/(app)/customers/[code]/edit", { code: row.original.code }),
				copy: [
					{ label: m.customers_copy_code(), value: row.original.code },
					{ label: m.customers_copy_email(), value: row.original.email },
				],
			}),
	}),
});
