import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import { countryName } from "#lib/components/customers/countries.js";
import CustomerLink from "#lib/components/customers/customer-link.svelte";
import SegmentBadge from "#lib/components/customers/segment-badge.svelte";
import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { intlLocale } from "#lib/format.js";
import { customerSegments } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";

import type { getCustomers } from "./customers.remote.js";

export type CustomerRow = Awaited<ReturnType<typeof getCustomers>>[number];

const column = createAppColumnHelper<CustomerRow>();

export const columns = column.columns([
	column.display({
		id: "select",
		header: ({ header }) => renderComponent(header.SelectAllHeader),
		cell: ({ cell }) => renderComponent(cell.SelectCell),
		enableSorting: false,
		enableHiding: false,
	}),
	column.accessor("name", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(CustomerLink, {
				code: row.original.code,
				name: row.original.name,
				withCode: true,
			}),
		enableHiding: false,
		meta: { label: m.customers_column_customer },
	}),
	column.accessor("contactName", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.contactName,
				secondary: row.original.email,
			}),
		meta: { label: m.customers_column_contact },
	}),
	column.accessor("country", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.city,
				secondary: countryName(row.original.country),
			}),
		filterFn: "oneOf",
		// By country (by its name as shown), then city.
		sortFn: (a, b) =>
			countryName(a.original.country).localeCompare(
				countryName(b.original.country),
				intlLocale(),
			) || a.original.city.localeCompare(b.original.city, intlLocale()),
		meta: { label: m.customers_column_location },
	}),
	column.accessor("segment", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(SegmentBadge, { segment: getValue() }),
		filterFn: "oneOf",
		// By size rather than alphabetically.
		sortFn: (a, b, id) =>
			customerSegments.indexOf(a.getValue(id)) - customerSegments.indexOf(b.getValue(id)),
		enableGlobalFilter: false,
		meta: { label: m.customers_column_segment },
	}),
	column.accessor("equipmentCount", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		meta: { label: m.customers_column_equipment, align: "end" },
	}),
	column.accessor("openOrders", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		meta: { label: m.customers_column_open_orders, align: "end" },
	}),
	column.accessor("createdAt", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.customers_column_since },
	}),
	// Hidden, and not in the column menu: lets the search box find customers by details that
	// are shown in other columns' second lines (code, email, city, the country as shown) or not
	// at all (phone).
	column.accessor(
		(row) => [row.code, row.email, row.city, row.phone, countryName(row.country)].join(" "),
		{ id: "search", enableSorting: false, enableHiding: false },
	),
	column.display({
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
]);
