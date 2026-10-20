import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { noneToken } from "#lib/components/data-table/url-state.ts";
import { CustomerLink } from "#lib/customers/components.ts";
import { EngineerLink } from "#lib/engineers/components.ts";
import { unitTitle } from "#lib/equipment/index.ts";
import { label } from "#lib/i18n/index.ts";
import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.ts";

import { orderPriorityDisplay, orderStatusDisplay } from "../display.ts";
import OrderLink from "../ui/order-link.svelte";
import TypeLabel from "../ui/type-label.svelte";
import type { getOrders } from "./order-list.remote.ts";
import StatusCell from "./status-cell.svelte";
import UnitsCell from "./units-cell.svelte";

/** A row of the orders list, a page of which comes from the server (see `ordersList`). */
export type OrderRow = Awaited<ReturnType<typeof getOrders>>["rows"][number];

const column = createAppColumnHelper<OrderRow>();

export const columns = column.columns([
	column.select(),
	column.accessor("number", {
		cell: ({ getValue }) => renderComponent(OrderLink, { number: getValue() }),
		enableHiding: false,
		meta: { label: m.orders_column_order },
	}),
	column.accessor((row) => row.customer.name, {
		id: "customer",
		cell: ({ row }) =>
			renderComponent(CustomerLink, {
				code: row.original.customer.code,
				name: row.original.customer.name,
				withCode: true,
			}),
		// By the customer's code (e.g. `?customer=CUST-0001`, from a customer's page). The server
		// filters, but the table needs a filter function all the same.
		filterFn: (row, _id, codes: string[]) => codes.includes(row.original.customer.code),
		enableGrouping: true,
		getGroupingValue: (row) => row.customer.code,
		meta: { label: m.orders_column_customer, filter: "set" },
	}),
	column.accessor(
		// By the first unit; `undefined` rather than `null`, so new installations sort last
		// (`sortUndefined`).
		(row) => (row.equipment ? unitTitle(row.equipment) : undefined),
		{
			id: "equipment",
			// The first unit, its make under the customer's own name for it, and "+14" for the rest.
			cell: ({ row }) =>
				renderComponent(UnitsCell, {
					first: row.original.equipment,
					count: row.original.unitCount,
				}),
			sortUndefined: "last",
			// By serial number, any of its units' (the server filters: the rows have the first);
			// `none` keeps the new installations.
			filterFn: (row, _id, serials: string[]) =>
				serials.includes(row.original.equipment?.serialNumber ?? noneToken),
			meta: { label: m.orders_column_equipment, filter: "set" },
		},
	),
	column.enum("type", {
		values: orderTypes,
		label: (type) => label("orderType", type),
		cell: ({ getValue }) => renderComponent(TypeLabel, { type: getValue()! }),
		meta: { label: m.orders_column_type },
	}),
	column.enum("status", {
		values: orderStatuses,
		display: orderStatusDisplay,
		// The status cell's badge filters by its value itself.
		clickFilter: false,
		cell: ({ getValue, row, column }) =>
			renderComponent(StatusCell, {
				id: row.original.id,
				number: row.original.number,
				status: getValue()!,
				tags: row.original.tags,
				// Grouped by status, it's the group's heading, which changes no order.
				fixed: column.getIsGrouped(),
			}),
		meta: { label: m.orders_column_status },
	}),
	column.enum("priority", {
		values: orderPriorities,
		display: orderPriorityDisplay,
		// By urgency rather than alphabetically.
		sortByOrder: true,
		meta: { label: m.orders_column_priority },
	}),
	column.accessor((row) => row.engineer?.name, {
		id: "engineer",
		cell: ({ row }) =>
			row.original.engineer
				? renderComponent(EngineerLink, {
						id: row.original.engineer.id,
						name: row.original.engineer.name,
						secondary: null,
					})
				: renderComponent(TwoLineCell, { fallback: m.common_unassigned() }),
		sortUndefined: "last",
		// By id; `none` keeps the unassigned orders.
		filterFn: (row, _id, ids: string[]) =>
			ids.includes(row.original.engineer ? String(row.original.engineer.id) : noneToken),
		enableGrouping: true,
		getGroupingValue: (row) => row.engineer?.id,
		meta: { label: m.orders_column_engineer, filter: "set" },
	}),
	column.accessor((row) => row.scheduledFor ?? undefined, {
		id: "scheduledFor",
		cell: ({ cell }) => renderComponent(cell.DateCell),
		sortUndefined: "last",
		enableGlobalFilter: false,
		// By a range of days, e.g. `?scheduled=this-week`.
		filterFn: "inDateRange",
		// `?scheduled=none`: the unscheduled orders.
		meta: { label: m.orders_column_scheduled, param: "scheduled", filterNone: true },
	}),
	column.accessor("createdAt", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		filterFn: "inDateRange",
		meta: { label: m.orders_column_created, param: "created" },
	}),
	column.accessor("total", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		// Modules adjust it (e.g. what a contract includes), which the database can't sort by; it
		// filters by amounts in euros (`?total=500..`), priced like the rows (`withTotalIn`).
		enableSorting: false,
		filterFn: "inMoneyRange",
		meta: { label: m.orders_column_total, align: "end" },
	}),
	column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.number,
				href: resolve("/(app)/orders/[number]", { number: row.original.number }),
				editHref: resolve("/(app)/orders/[number]/edit", { number: row.original.number }),
				copy: [
					{ label: m.orders_copy_number(), value: row.original.number },
					{ label: m.orders_copy_customer_code(), value: row.original.customer.code },
				],
			}),
	}),
]);
