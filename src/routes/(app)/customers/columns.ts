import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import CustomerLink from "#lib/components/customers/customer-link.svelte";
import SegmentBadge from "#lib/components/customers/segment-badge.svelte";
import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { customerSegments } from "#lib/models.js";

import CountCell from "./count-cell.svelte";
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
		meta: { label: "Customer" },
	}),
	column.accessor("contactName", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.contactName,
				secondary: row.original.email,
			}),
		meta: { label: "Contact" },
	}),
	column.accessor("country", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.city,
				secondary: row.original.country,
			}),
		filterFn: "oneOf",
		// By country, then city.
		sortFn: (a, b) =>
			a.original.country.localeCompare(b.original.country) ||
			a.original.city.localeCompare(b.original.city),
		meta: { label: "Location" },
	}),
	column.accessor("segment", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(SegmentBadge, { segment: getValue() }),
		filterFn: "oneOf",
		// By size rather than alphabetically.
		sortFn: (a, b, id) =>
			customerSegments.indexOf(a.getValue(id)) - customerSegments.indexOf(b.getValue(id)),
		enableGlobalFilter: false,
		meta: { label: "Segment" },
	}),
	column.accessor("equipmentCount", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: () => renderComponent(CountCell),
		enableGlobalFilter: false,
		meta: { label: "Equipment", align: "end" },
	}),
	column.accessor("openOrders", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: () => renderComponent(CountCell),
		enableGlobalFilter: false,
		meta: { label: "Open orders", align: "end" },
	}),
	column.accessor("createdAt", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: "Customer since" },
	}),
	// Hidden, and not in the column menu: lets the search box find customers by details that
	// are shown in other columns' second lines (code, email, city) or not at all (phone).
	column.accessor((row) => [row.code, row.email, row.city, row.phone].join(" "), {
		id: "search",
		enableSorting: false,
		enableHiding: false,
	}),
	column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.name,
				href: resolve("/(app)/customers/[code]", { code: row.original.code }),
				editHref: resolve("/(app)/customers/[code]/edit", { code: row.original.code }),
				copy: [
					{ label: "Copy customer code", value: row.original.code },
					{ label: "Copy email", value: row.original.email },
				],
			}),
	}),
]);
