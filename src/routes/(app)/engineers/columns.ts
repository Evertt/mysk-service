import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import ActiveBadge from "#lib/components/engineers/active-badge.svelte";
import { regionLabel } from "#lib/components/engineers/display.js";
import SpecialtyBadge from "#lib/components/engineers/specialty-badge.svelte";
import { engineerSpecialties } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";

import type { getEngineers } from "./engineers.remote.js";

export type EngineerRow = Awaited<ReturnType<typeof getEngineers>>[number];

const column = createAppColumnHelper<EngineerRow>();

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
			renderComponent(TwoLineCell, {
				primary: row.original.name,
				secondary: row.original.email,
				href: resolve("/(app)/engineers/[id]", { id: String(row.original.id) }),
			}),
		enableHiding: false,
		meta: { label: m.engineers_column_engineer },
	}),
	// Hidden; it lets the search find engineers by email address.
	column.accessor("email", {
		enableSorting: false,
		enableHiding: false,
		meta: { label: m.engineers_column_email },
	}),
	column.accessor("specialty", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(SpecialtyBadge, { specialty: getValue() }),
		filterFn: "oneOf",
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_specialty, filterValues: engineerSpecialties },
	}),
	column.accessor("region", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => regionLabel(getValue()),
		filterFn: "oneOf",
		meta: { label: m.engineers_column_region },
	}),
	column.accessor("hourlyRate", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_hourly_rate, align: "end", param: "rate" },
	}),
	column.accessor((row) => (row.active ? "active" : "inactive"), {
		id: "status",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) => renderComponent(ActiveBadge, { active: row.original.active }),
		filterFn: "oneOf",
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_status, filterValues: ["active", "inactive"] },
	}),
	column.accessor("openOrders", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_open_orders, align: "end", param: "open-orders" },
	}),
	column.accessor("hiredAt", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_hired, param: "hired" },
	}),
	column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.name,
				href: resolve("/(app)/engineers/[id]", { id: String(row.original.id) }),
				editHref: resolve("/(app)/engineers/[id]/edit", { id: String(row.original.id) }),
				copy: [
					{ label: m.engineers_copy_email(), value: row.original.email },
					{ label: m.engineers_copy_phone(), value: row.original.phone },
				],
			}),
	}),
]);
