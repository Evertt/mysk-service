import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { noneToken } from "#lib/components/data-table/url-state.ts";
import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.ts";
import { OrderLink, PriorityBadge, TypeLabel } from "#lib/orders/components";

import type { getOrders } from "./order-list.remote.ts";
import StatusCell from "./status-cell.svelte";

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
			renderComponent(TwoLineCell, {
				primary: row.original.customer.name,
				secondary: row.original.customer.code,
				href: resolve("/(app)/customers/[code]", { code: row.original.customer.code }),
			}),
		// By the customer's code (e.g. `?customer=CUST-0001`, from a customer's page). The server
		// filters, but the table needs a filter function all the same.
		filterFn: (row, _id, codes: string[]) => codes.includes(row.original.customer.code),
		enableGrouping: true,
		getGroupingValue: (row) => row.customer.code,
		meta: { label: m.orders_column_customer, filter: "set" },
	}),
	column.accessor(
		// `undefined` rather than `null`, so new installations sort last (`sortUndefined`).
		(row) => (row.equipment ? `${row.equipment.manufacturer} ${row.equipment.model}` : undefined),
		{
			id: "equipment",
			cell: ({ getValue, row }) =>
				renderComponent(TwoLineCell, {
					primary: getValue(),
					secondary: row.original.equipment?.serialNumber,
					href:
						(row.original.equipment &&
							resolve("/(app)/equipment/[serial]", {
								serial: row.original.equipment.serialNumber,
							})) ??
						undefined,
					fallback: m.orders_new_installation(),
				}),
			sortUndefined: "last",
			// By serial number; `none` keeps the new installations.
			filterFn: (row, _id, serials: string[]) =>
				serials.includes(row.original.equipment?.serialNumber ?? noneToken),
			meta: { label: m.orders_column_equipment, filter: "set" },
		},
	),
	column.accessor("type", {
		cell: ({ getValue }) => renderComponent(TypeLabel, { type: getValue() }),
		filterFn: "oneOf",
		enableGrouping: true,
		meta: { label: m.orders_column_type, filterValues: orderTypes },
	}),
	column.accessor("status", {
		cell: ({ getValue, row }) =>
			renderComponent(StatusCell, { status: getValue(), tags: row.original.tags }),
		filterFn: "oneOf",
		enableGrouping: true,
		meta: { label: m.orders_column_status, filterValues: orderStatuses },
	}),
	column.accessor("priority", {
		cell: ({ getValue }) => renderComponent(PriorityBadge, { priority: getValue() }),
		filterFn: "oneOf",
		enableGrouping: true,
		// By urgency rather than alphabetically.
		sortFn: (a, b, id) =>
			orderPriorities.indexOf(a.getValue(id)) - orderPriorities.indexOf(b.getValue(id)),
		meta: { label: m.orders_column_priority, filterValues: orderPriorities },
	}),
	column.accessor((row) => row.engineer?.name, {
		id: "engineer",
		cell: ({ getValue, row }) =>
			renderComponent(TwoLineCell, {
				primary: getValue(),
				href:
					(row.original.engineer &&
						resolve("/(app)/engineers/[id]", { id: String(row.original.engineer.id) })) ??
					undefined,
				fallback: m.common_unassigned(),
			}),
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
		meta: { label: m.orders_column_scheduled, param: "scheduled" },
	}),
	column.accessor("createdAt", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.orders_column_created, param: "created" },
	}),
	column.accessor("total", {
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		// Modules adjust it (e.g. what a contract includes), which the database can't sort by.
		enableSorting: false,
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
