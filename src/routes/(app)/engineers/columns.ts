import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import ActiveBadge from "#lib/engineers/active-badge.svelte";
import { regionLabel } from "#lib/engineers/display.js";
import SpecialtyBadge from "#lib/engineers/specialty-badge.svelte";
import { engineerSpecialties } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";

import type { getEngineers } from "./engineers.remote.js";

export type EngineerRow = Awaited<ReturnType<typeof getEngineers>>[number];

const column = createAppColumnHelper<EngineerRow>();

export const columns = column.columns([
	column.select(),
	column.accessor("name", {
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
		cell: ({ getValue }) => renderComponent(SpecialtyBadge, { specialty: getValue() }),
		filterFn: "oneOf",
		enableGrouping: true,
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_specialty, filterValues: engineerSpecialties },
	}),
	column.accessor("region", {
		cell: ({ getValue }) => regionLabel(getValue()),
		filterFn: "oneOf",
		enableGrouping: true,
		meta: { label: m.engineers_column_region },
	}),
	column.accessor("hourlyRate", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_hourly_rate, align: "end", param: "rate" },
	}),
	column.accessor((row) => (row.active ? "active" : "inactive"), {
		id: "status",
		cell: ({ row }) => renderComponent(ActiveBadge, { active: row.original.active }),
		filterFn: "oneOf",
		enableGrouping: true,
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_status, filterValues: ["active", "inactive"] },
	}),
	column.accessor("openOrders", {
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_open_orders, align: "end", param: "open-orders" },
	}),
	column.accessor("hiredAt", {
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
