import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import EnumBadge from "#lib/components/enum-badge.svelte";
import { labelOrValue } from "#lib/i18n/index.ts";
import { engineerSpecialties } from "#lib/models.ts";

import { regionLabel, engineerSpecialtyDisplay } from "../display.ts";
import type { getEngineers } from "../engineers.remote.ts";
import EngineerLink from "../ui/engineer-link.svelte";
import StatusCell from "./status-cell.svelte";

export type EngineerRow = Awaited<ReturnType<typeof getEngineers>>[number];

const column = createAppColumnHelper<EngineerRow>();

export const columns = column.columns([
	column.select(),
	column.accessor("name", {
		cell: ({ row }) =>
			renderComponent(EngineerLink, {
				id: row.original.id,
				name: row.original.name,
				secondary: row.original.email,
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
		cell: ({ getValue }) =>
			renderComponent(EnumBadge, { display: engineerSpecialtyDisplay, value: getValue() }),
		filterFn: "oneOf",
		enableGrouping: true,
		enableGlobalFilter: false,
		meta: {
			label: m.engineers_column_specialty,
			filterValues: engineerSpecialties,
			clickFilter: (specialty) => labelOrValue("engineerSpecialty", specialty),
		},
	}),
	column.accessor("region", {
		cell: ({ getValue }) => regionLabel(getValue()),
		filterFn: "oneOf",
		enableGrouping: true,
		meta: { label: m.engineers_column_region, clickFilter: regionLabel },
	}),
	column.accessor("hourlyRate", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		filterFn: "inMoneyRange",
		meta: { label: m.engineers_column_hourly_rate, align: "end", param: "rate" },
	}),
	column.accessor((row) => (row.active ? "active" : "inactive"), {
		id: "status",
		cell: ({ row, column }) =>
			renderComponent(StatusCell, {
				id: row.original.id,
				name: row.original.name,
				active: row.original.active,
				// Grouped by status, it's the group's heading, which changes no engineer.
				fixed: column.getIsGrouped(),
			}),
		filterFn: "oneOf",
		enableGrouping: true,
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_status, filterValues: ["active", "inactive"] },
	}),
	column.accessor("openOrders", {
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		filterFn: "inNumberRange",
		meta: { label: m.engineers_column_open_orders, align: "end", param: "open-orders" },
	}),
	column.accessor("hiredAt", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		filterFn: "inDateRange",
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
