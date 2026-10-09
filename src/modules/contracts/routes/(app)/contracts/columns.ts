import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { formatCents, formatDate } from "#lib/i18n/format.ts";
import { m } from "#lib/paraglide/messages.js";

import ContractLink from "../../../contract-link.svelte";
import { formatTerm } from "../../../display.ts";
import LevelBadge from "../../../level-badge.svelte";
import { contractLevels, contractStatus, contractStatuses } from "../../../model.ts";
import StatusBadge from "../../../status-badge.svelte";
import type { getContracts } from "./contracts.remote.ts";

export type ContractRow = Awaited<ReturnType<typeof getContracts>>[number];

const column = createAppColumnHelper<ContractRow>();

export const columns = column.columns([
	column.select(),
	column.accessor("number", {
		cell: ({ getValue }) => renderComponent(ContractLink, { number: getValue() }),
		enableHiding: false,
		meta: { label: m.contracts_contract },
	}),
	column.accessor((row) => row.customer.name, {
		id: "customer",
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.customer.name,
				secondary: row.original.customer.code,
			}),
		// By the customer's code, e.g. `?customer=CUST-0001`.
		filterFn: (row, _id, codes: string[]) => codes.includes(row.original.customer.code),
		enableGrouping: true,
		getGroupingValue: (row) => row.customer.code,
		meta: { label: m.contracts_customer, filter: "set" },
	}),
	column.accessor("level", {
		cell: ({ getValue }) => renderComponent(LevelBadge, { level: getValue() }),
		filterFn: "oneOf",
		enableGrouping: true,
		// From basic to premium rather than alphabetically.
		sortFn: (a, b, id) =>
			contractLevels.indexOf(a.getValue(id)) - contractLevels.indexOf(b.getValue(id)),
		meta: { label: m.contracts_level, filterValues: contractLevels },
	}),
	// Not stored: follows from the period and today's date.
	column.accessor((row) => contractStatus(row), {
		id: "status",
		cell: ({ getValue }) => renderComponent(StatusBadge, { status: getValue() }),
		filterFn: "oneOf",
		enableGrouping: true,
		sortFn: (a, b, id) =>
			contractStatuses.indexOf(a.getValue(id)) - contractStatuses.indexOf(b.getValue(id)),
		meta: { label: m.contracts_status, filterValues: contractStatuses },
	}),
	column.accessor("startsOn", {
		id: "period",
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: `${formatDate(row.original.startsOn)} – ${formatDate(row.original.endsOn)}`,
				secondary: formatTerm(row.original.startsOn, row.original.endsOn),
			}),
		enableGlobalFilter: false,
		meta: { label: m.contracts_period },
	}),
	column.accessor("units", {
		cell: ({ cell }) => renderComponent(cell.NumberCell, { format: m.common_count_units }),
		enableGlobalFilter: false,
		meta: { label: m.contracts_covers, align: "end" },
	}),
	column.accessor("responseHours", {
		cell: ({ cell }) => renderComponent(cell.NumberCell, { format: m.common_count_hours_short }),
		enableGlobalFilter: false,
		meta: { label: m.contracts_response, align: "end", param: "response" },
	}),
	column.accessor("monthlyFee", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: {
			label: m.contracts_monthly_fee,
			align: "end",
			param: "fee",
			groupSum: (sum) => formatCents(sum),
		},
	}),
	column.accessor("createdAt", {
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
