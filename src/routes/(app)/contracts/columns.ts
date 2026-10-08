import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import ContractLink from "#lib/components/contracts/contract-link.svelte";
import { formatTerm } from "#lib/components/contracts/display.js";
import LevelBadge from "#lib/components/contracts/level-badge.svelte";
import StatusBadge from "#lib/components/contracts/status-badge.svelte";
import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { formatDate } from "#lib/format.js";
import { contractLevels, contractStatus, contractStatuses } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";

import type { getContracts } from "./contracts.remote.js";

export type ContractRow = Awaited<ReturnType<typeof getContracts>>[number];

const column = createAppColumnHelper<ContractRow>();

export const columns = column.columns([
	column.display({
		id: "select",
		header: ({ header }) => renderComponent(header.SelectAllHeader),
		cell: ({ cell }) => renderComponent(cell.SelectCell),
		enableSorting: false,
		enableHiding: false,
	}),
	column.accessor("number", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(ContractLink, { number: getValue() }),
		enableHiding: false,
		meta: { label: m.contracts_contract },
	}),
	column.accessor((row) => row.customer.name, {
		id: "customer",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.customer.name,
				secondary: row.original.customer.code,
			}),
		meta: { label: m.contracts_customer },
	}),
	column.accessor("level", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(LevelBadge, { level: getValue() }),
		filterFn: "oneOf",
		// From basic to premium rather than alphabetically.
		sortFn: (a, b, id) =>
			contractLevels.indexOf(a.getValue(id)) - contractLevels.indexOf(b.getValue(id)),
		meta: { label: m.contracts_level, filterValues: contractLevels },
	}),
	// Not stored: follows from the period and today's date.
	column.accessor((row) => contractStatus(row), {
		id: "status",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(StatusBadge, { status: getValue() }),
		filterFn: "oneOf",
		sortFn: (a, b, id) =>
			contractStatuses.indexOf(a.getValue(id)) - contractStatuses.indexOf(b.getValue(id)),
		meta: { label: m.contracts_status, filterValues: contractStatuses },
	}),
	column.accessor("startsOn", {
		id: "period",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: `${formatDate(row.original.startsOn)} – ${formatDate(row.original.endsOn)}`,
				secondary: formatTerm(row.original.startsOn, row.original.endsOn),
			}),
		enableGlobalFilter: false,
		meta: { label: m.contracts_period },
	}),
	column.accessor("units", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.NumberCell, { format: m.common_count_units }),
		enableGlobalFilter: false,
		meta: { label: m.contracts_covers, align: "end" },
	}),
	column.accessor("responseHours", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.NumberCell, { format: m.common_count_hours_short }),
		enableGlobalFilter: false,
		meta: { label: m.contracts_response, align: "end", param: "response" },
	}),
	column.accessor("monthlyFee", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.contracts_monthly_fee, align: "end", param: "fee" },
	}),
	column.accessor("createdAt", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.contracts_created, param: "created" },
	}),
	column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.number,
				href: resolve("/(app)/contracts/[number]", { number: row.original.number }),
				editHref: resolve("/(app)/contracts/[number]/edit", { number: row.original.number }),
				copy: [
					{ label: m.contracts_copy_number(), value: row.original.number },
					{ label: m.contracts_copy_customer_code(), value: row.original.customer.code },
				],
			}),
	}),
]);
