import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import ActiveBadge from "#lib/components/engineers/active-badge.svelte";
import SpecialtyBadge from "#lib/components/engineers/specialty-badge.svelte";

import EngineerCell from "./engineer-cell.svelte";
import type { getEngineers } from "./engineers.remote.js";
import OpenOrdersCell from "./open-orders-cell.svelte";

export type EngineerRow = Awaited<ReturnType<typeof getEngineers>>[number];

const column = createAppColumnHelper<EngineerRow>();

export const columns = column.columns([
	column.accessor("name", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(EngineerCell, {
				id: row.original.id,
				name: row.original.name,
				email: row.original.email,
			}),
		enableHiding: false,
		meta: { label: "Engineer" },
	}),
	// Hidden; it lets the search find engineers by email address.
	column.accessor("email", {
		enableSorting: false,
		enableHiding: false,
		meta: { label: "Email" },
	}),
	column.accessor("specialty", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(SpecialtyBadge, { specialty: getValue() }),
		filterFn: "oneOf",
		enableGlobalFilter: false,
		meta: { label: "Specialty" },
	}),
	column.accessor("region", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		filterFn: "oneOf",
		meta: { label: "Region" },
	}),
	column.accessor("hourlyRate", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: "Hourly rate", align: "end" },
	}),
	column.accessor((row) => (row.active ? "active" : "inactive"), {
		id: "status",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) => renderComponent(ActiveBadge, { active: row.original.active }),
		filterFn: "oneOf",
		enableGlobalFilter: false,
		meta: { label: "Status" },
	}),
	column.accessor("openOrders", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(OpenOrdersCell, { count: getValue() }),
		enableGlobalFilter: false,
		meta: { label: "Open orders", align: "end" },
	}),
	column.accessor("hiredAt", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: "Hired" },
	}),
	column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.name,
				href: resolve("/(app)/engineers/[id]", { id: String(row.original.id) }),
				editHref: resolve("/(app)/engineers/[id]/edit", { id: String(row.original.id) }),
				copy: [
					{ label: "Copy email", value: row.original.email },
					{ label: "Copy phone", value: row.original.phone },
				],
			}),
	}),
]);
