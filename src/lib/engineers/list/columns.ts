import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import { withListColumns } from "#lib/components/data-table/list-definition.ts";
import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import { engineerSpecialties } from "#lib/models.ts";

import { regionLabel, engineerSpecialtyDisplay } from "../display.ts";
import type { getEngineers } from "../engineers.remote.ts";
import EngineerLink from "../ui/engineer-link.svelte";
import { engineersList, engineerStates } from "./engineers-list.ts";
import StatusCell from "./status-cell.svelte";

export type EngineerRow = Awaited<ReturnType<typeof getEngineers>>[number];

const column = createAppColumnHelper<EngineerRow>();

export const columns = withListColumns(engineersList, {
	select: column.select(),
	name: column.accessor("name", {
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
	email: column.accessor("email", {
		enableHiding: false,
		meta: { label: m.engineers_column_email },
	}),
	specialty: column.enum("specialty", {
		values: engineerSpecialties,
		display: engineerSpecialtyDisplay,
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_specialty },
	}),
	region: column.accessor("region", {
		cell: ({ getValue }) => regionLabel(getValue()),
		meta: { label: m.engineers_column_region, clickFilter: regionLabel },
	}),
	hourlyRate: column.accessor("hourlyRate", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_hourly_rate, align: "end" },
	}),
	status: column.enum((row) => (row.active ? "active" : "inactive"), {
		id: "status",
		values: engineerStates,
		label: (state) => (state === "active" ? m.engineers_active() : m.engineers_inactive()),
		// The status cell switches it.
		clickFilter: false,
		cell: ({ row, column }) =>
			renderComponent(StatusCell, {
				id: row.original.id,
				name: row.original.name,
				active: row.original.active,
				// Grouped by status, it's the group's heading, which changes no engineer.
				fixed: column.getIsGrouped(),
			}),
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_status },
	}),
	openOrders: column.accessor("openOrders", {
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_open_orders, align: "end" },
	}),
	hiredAt: column.accessor("hiredAt", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.engineers_column_hired },
	}),
	actions: column.display({
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
});
