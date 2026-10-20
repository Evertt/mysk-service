import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import { withListColumns } from "#lib/components/data-table/list-definition.ts";
import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { formatCents, formatDate } from "#lib/i18n/index.ts";

import type { getContracts } from "../contracts.remote.ts";
import { formatTerm, contractLevelDisplay, contractStatusDisplay } from "../display.ts";
import { contractLevels, contractStatus, contractStatuses } from "../model.ts";
import ContractLink from "../ui/contract-link.svelte";
import { contractsList } from "./contracts-list.ts";

export type ContractRow = Awaited<ReturnType<typeof getContracts>>[number];

const column = createAppColumnHelper<ContractRow>();

export const columns = withListColumns(contractsList, {
	select: column.select(),
	number: column.accessor("number", {
		cell: ({ getValue }) => renderComponent(ContractLink, { number: getValue() }),
		enableHiding: false,
		meta: { label: m.contracts_contract },
	}),
	customer: column.accessor((row) => row.customer.name, {
		id: "customer",
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.customer.name,
				secondary: row.original.customer.code,
			}),
		// By the customer's code, e.g. `?customer=CUST-0001`.
		getGroupingValue: (row) => row.customer.code,
		meta: { label: m.contracts_customer },
	}),
	level: column.enum("level", {
		values: contractLevels,
		display: contractLevelDisplay,
		// From basic to premium rather than alphabetically.
		sortByOrder: true,
		meta: { label: m.contracts_level },
	}),
	// Not stored: follows from the period and today's date.
	status: column.enum((row) => contractStatus(row), {
		id: "status",
		values: contractStatuses,
		display: contractStatusDisplay,
		sortByOrder: true,
		meta: { label: m.contracts_status },
	}),
	period: column.accessor("startsOn", {
		id: "period",
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: `${formatDate(row.original.startsOn)} – ${formatDate(row.original.endsOn)}`,
				secondary: formatTerm(row.original.startsOn, row.original.endsOn),
			}),
		enableGlobalFilter: false,
		meta: { label: m.contracts_period },
	}),
	units: column.accessor("units", {
		cell: ({ cell }) => renderComponent(cell.NumberCell, { format: m.common_count_units }),
		enableGlobalFilter: false,
		meta: { label: m.contracts_covers, align: "end" },
	}),
	responseHours: column.accessor("responseHours", {
		cell: ({ cell }) => renderComponent(cell.NumberCell, { format: m.common_count_hours_short }),
		enableGlobalFilter: false,
		meta: { label: m.contracts_response, align: "end" },
	}),
	monthlyFee: column.accessor("monthlyFee", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: m.contracts_monthly_fee, align: "end", groupSum: (sum) => formatCents(sum) },
	}),
	createdAt: column.accessor("createdAt", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.contracts_created },
	}),
	actions: column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.number,
				href: resolve("/(app)/(modules)/contracts/[number]", { number: row.original.number }),
				editHref: resolve("/(app)/(modules)/contracts/[number]/edit", {
					number: row.original.number,
				}),
				copy: [
					{ label: m.contracts_copy_number(), value: row.original.number },
					{ label: m.contracts_copy_customer_code(), value: row.original.customer.code },
				],
			}),
	}),
});
