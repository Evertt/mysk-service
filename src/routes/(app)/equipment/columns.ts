import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import CustomerLink from "#lib/components/customers/customer-link.svelte";
import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.js";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import CategoryLabel from "#lib/components/equipment/category-label.svelte";
import StatusBadge from "#lib/components/equipment/status-badge.svelte";
import { equipmentCategories, equipmentStatuses } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";

import type { getEquipmentList } from "./equipment.remote.js";
import WarrantyCell from "./warranty-cell.svelte";

/** A row of the equipment list, a page of which comes from the server (see `equipmentUrl`). */
export type EquipmentRow = Awaited<ReturnType<typeof getEquipmentList>>["rows"][number];

const column = createAppColumnHelper<EquipmentRow>();

export const columns = column.columns([
	column.display({
		id: "select",
		header: ({ header }) => renderComponent(header.SelectAllHeader),
		cell: ({ cell }) => renderComponent(cell.SelectCell),
		enableSorting: false,
		enableHiding: false,
	}),
	column.accessor((row) => `${row.manufacturer} ${row.model}`, {
		id: "unit",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue, row }) =>
			renderComponent(TwoLineCell, {
				primary: getValue(),
				secondary: row.original.serialNumber,
				href: resolve("/(app)/equipment/[serial]", { serial: row.original.serialNumber }),
			}),
		enableHiding: false,
		meta: { label: m.equipment_column_unit },
	}),
	// Hidden: makes serial numbers searchable.
	column.accessor("serialNumber", {
		enableHiding: false,
		meta: { label: m.equipment_column_serial_number, param: "serial" },
	}),
	// Hidden: for the manufacturer filter.
	column.accessor("manufacturer", {
		filterFn: "oneOf",
		enableHiding: false,
		meta: { label: m.equipment_column_manufacturer },
	}),
	column.accessor("category", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(CategoryLabel, { category: getValue() }),
		filterFn: "oneOf",
		meta: { label: m.equipment_column_category, filterValues: equipmentCategories },
	}),
	column.accessor("status", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(StatusBadge, { status: getValue() }),
		filterFn: "oneOf",
		meta: { label: m.equipment_column_status, filterValues: equipmentStatuses },
	}),
	column.accessor((row) => row.customer.name, {
		id: "customer",
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ row }) =>
			renderComponent(CustomerLink, {
				name: row.original.customer.name,
				code: row.original.customer.code,
				withCode: true,
			}),
		// By the customer's code, e.g. `?customer=CUST-0001`.
		filterFn: (row, _id, codes: string[]) => codes.includes(row.original.customer.code),
		meta: { label: m.equipment_column_customer, filter: "set" },
	}),
	column.accessor("installedAt", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.equipment_column_installed, param: "installed" },
	}),
	column.accessor("warrantyUntil", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ getValue }) => renderComponent(WarrantyCell, { until: getValue() }),
		enableGlobalFilter: false,
		meta: { label: m.equipment_column_warranty, param: "warranty" },
	}),
	column.accessor("openOrders", {
		header: ({ header }) => renderComponent(header.ColumnHeader),
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		meta: { label: m.equipment_column_open_orders, align: "end", param: "open-orders" },
	}),
	column.display({
		id: "actions",
		cell: ({ row }) =>
			renderComponent(RowActions, {
				label: row.original.serialNumber,
				href: resolve("/(app)/equipment/[serial]", { serial: row.original.serialNumber }),
				editHref: resolve("/(app)/equipment/[serial]/edit", {
					serial: row.original.serialNumber,
				}),
				copy: [
					{ label: m.equipment_copy_serial(), value: row.original.serialNumber },
					{ label: m.equipment_copy_customer_code(), value: row.original.customer.code },
				],
			}),
	}),
]);
