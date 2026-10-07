import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import OrderLink from "#lib/components/orders/order-link.svelte";
import PriorityBadge from "#lib/components/orders/priority-badge.svelte";
import TypeLabel from "#lib/components/orders/type-label.svelte";
import { orderPriorities } from "#lib/models.js";

import type { getOrders } from "./orders.remote.js";
import StatusCell from "./status-cell.svelte";

export type OrderRow = Awaited<ReturnType<typeof getOrders>>[number];

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
		cell: ({ getValue }) => renderComponent(OrderLink, { number: getValue() }),
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
				href: resolve("/(app)/customers/[code]", { code: row.original.customer.code }),
			}),
		meta: { label: "Customer" },
	}),
	column.accessor(
		// `undefined` rather than `null`, so new installations sort last (`sortUndefined`).
		(row) => (row.equipment ? `${row.equipment.manufacturer} ${row.equipment.model}` : undefined),
		{
			id: "equipment",
			header: ({ header }) => renderComponent(header.ColumnHeader),
			cell: ({ getValue, row }) =>
				renderComponent(TwoLineCell, {
					primary: getValue(),
					secondary: row.original.equipment?.serialNumber,
					href:
						row.original.equipment &&
						resolve("/(app)/equipment/[serial]", { serial: row.original.equipment.serialNumber }),
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
		cell: ({ getValue, row }) =>
			renderComponent(StatusCell, { status: getValue(), tags: row.original.tags }),
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
		cell: ({ getValue, row }) =>
			renderComponent(TwoLineCell, {
				primary: getValue(),
				href:
					row.original.engineer &&
					resolve("/(app)/engineers/[id]", { id: String(row.original.engineer.id) }),
				fallback: "Unassigned",
			}),
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
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.number,
				href: resolve("/(app)/orders/[number]", { number: row.original.number }),
				editHref: resolve("/(app)/orders/[number]/edit", { number: row.original.number }),
				copy: [
					{ label: "Copy order number", value: row.original.number },
					{ label: "Copy customer code", value: row.original.customer.code },
				],
			}),
	}),
]);
