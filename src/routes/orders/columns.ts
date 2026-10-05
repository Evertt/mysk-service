import { renderComponent } from "@tanstack/svelte-table";

import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import PriorityBadge from "#lib/components/orders/priority-badge.svelte";
import StatusBadge from "#lib/components/orders/status-badge.svelte";
import TypeLabel from "#lib/components/orders/type-label.svelte";
import { orderPriorities } from "#lib/models.js";

import type { PageData } from "./$types";
import OrderActions from "./order-actions.svelte";

export type OrderRow = PageData["orders"][number];

const column = createAppColumnHelper<OrderRow>();

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
		enableHiding: false,
		meta: { label: "Order" },
	}),
	column.accessor((row) => row.customer.name, {
		id: "customer",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.customer.name,
				secondary: row.original.customer.code,
			}),
		meta: { label: "Customer" },
	}),
	column.accessor(
		(row) => row.equipment && `${row.equipment.manufacturer} ${row.equipment.model}`,
		{
			id: "equipment",
			header: ({ header }) => renderComponent(header.ColumnHeader),
			cell: ({ getValue, row }) =>
				renderComponent(TwoLineCell, {
					primary: getValue(),
					secondary: row.original.equipment?.serialNumber,
					fallback: "New installation",
				}),
			sortUndefined: "last",
			meta: { label: "Equipment" },
		},
	),
	column.accessor("type", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(TypeLabel, { type: getValue() }),
		filterFn: "oneOf",
		meta: { label: "Type" },
	}),
	column.accessor("status", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(StatusBadge, { status: getValue() }),
		filterFn: "oneOf",
		meta: { label: "Status" },
	}),
	column.accessor("priority", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(PriorityBadge, { priority: getValue() }),
		filterFn: "oneOf",
		// By urgency rather than alphabetically.
		sortFn: (a, b, id) =>
			orderPriorities.indexOf(a.getValue(id)) - orderPriorities.indexOf(b.getValue(id)),
		meta: { label: "Priority" },
	}),
	column.accessor((row) => row.engineer?.name, {
		id: "engineer",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) =>
			renderComponent(TwoLineCell, { primary: getValue(), fallback: "Unassigned" }),
		sortUndefined: "last",
		meta: { label: "Engineer" },
	}),
	column.accessor((row) => row.scheduledFor ?? undefined, {
		id: "scheduledFor",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		sortUndefined: "last",
		enableGlobalFilter: false,
		meta: { label: "Scheduled" },
	}),
	column.accessor("createdAt", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: "Created" },
	}),
	column.accessor("total", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.CurrencyCell),
		enableGlobalFilter: false,
		meta: { label: "Total", align: "end" },
	}),
	column.display({
		id: "actions",
		cell: ({ row }) => renderComponent(OrderActions, { order: row.original }),
	}),
]);
