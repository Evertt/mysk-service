import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { noneToken } from "#lib/components/data-table/url-state.ts";
import { CustomerLink } from "#lib/customers/components.ts";
import { labelOrValue } from "#lib/i18n/index.ts";
import { equipmentStatuses } from "#lib/models.ts";

import { unitModel, unitTitle } from "../display.ts";
import StatusBadge from "../ui/status-badge.svelte";
import type { getEquipmentList } from "./equipment-list.remote.ts";
import WarrantyCell from "./warranty-cell.svelte";

/** A row of the equipment list, a page of which comes from the server (see `equipmentList`). */
export type EquipmentRow = Awaited<ReturnType<typeof getEquipmentList>>["rows"][number];

const column = createAppColumnHelper<EquipmentRow>();

export const columns = column.columns([
	column.select(),
	column.accessor((row) => unitTitle(row), {
		id: "unit",
		cell: ({ getValue, row }) =>
			renderComponent(TwoLineCell, {
				primary: getValue(),
				// The make too, under the customer's own name for it.
				secondary: row.original.name
					? `${unitModel(row.original)} · ${row.original.serialNumber}`
					: row.original.serialNumber,
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
	// Hidden: for the manufacturer filter, and to group by.
	column.accessor("manufacturer", {
		filterFn: "oneOf",
		enableHiding: false,
		enableGrouping: true,
		meta: { label: m.equipment_column_manufacturer },
	}),
	// One of the tenant's categories, shown by name, filtered and grouped by id (`?category=3`).
	column.accessor((row) => row.category.name, {
		id: "category",
		filterFn: (row, _id, ids: string[]) => ids.includes(String(row.original.category.id)),
		enableGrouping: true,
		getGroupingValue: (row) => row.category.id,
		meta: { label: m.equipment_column_category, filter: "set" },
	}),
	column.accessor("status", {
		cell: ({ getValue }) => renderComponent(StatusBadge, { status: getValue() }),
		filterFn: "oneOf",
		enableGrouping: true,
		meta: {
			label: m.equipment_column_status,
			filterValues: equipmentStatuses,
			clickFilter: (status) => labelOrValue("equipmentStatus", status),
		},
	}),
	column.accessor((row) => row.customer.name, {
		id: "customer",
		cell: ({ row }) =>
			renderComponent(CustomerLink, {
				name: row.original.customer.name,
				code: row.original.customer.code,
				withCode: true,
			}),
		// By the customer's code, e.g. `?customer=CUST-0001`.
		filterFn: (row, _id, codes: string[]) => codes.includes(row.original.customer.code),
		enableGrouping: true,
		getGroupingValue: (row) => row.customer.code,
		meta: { label: m.equipment_column_customer, filter: "set" },
	}),
	column.accessor((row) => row.site.name, {
		id: "site",
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.site.name,
				// The town, unless the site is named after it.
				secondary: row.original.site.name.includes(row.original.site.city)
					? null
					: row.original.site.city,
			}),
		enableGlobalFilter: false,
		meta: { label: m.equipment_column_site },
	}),
	// One of the site's locations, shown by name and filtered by id (`?location=12`, `none`).
	column.accessor((row) => row.location?.name, {
		id: "location",
		cell: ({ row }) =>
			renderComponent(TwoLineCell, {
				primary: row.original.location?.name,
				href: row.original.location
					? resolve("/(app)/equipment/locations/[id]", { id: String(row.original.location.id) })
					: undefined,
			}),
		sortUndefined: "last",
		enableGlobalFilter: false,
		filterFn: (row, _id, ids: string[]) =>
			ids.includes(row.original.location ? String(row.original.location.id) : noneToken),
		meta: { label: m.equipment_column_location, filter: "set" },
	}),
	column.accessor("installedAt", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		filterFn: "inDateRange",
		meta: { label: m.equipment_column_installed, param: "installed" },
	}),
	column.accessor("warrantyUntil", {
		cell: ({ getValue }) => renderComponent(WarrantyCell, { until: getValue() }),
		enableGlobalFilter: false,
		filterFn: "inDateRange",
		meta: { label: m.equipment_column_warranty, param: "warranty" },
	}),
	column.accessor("openOrders", {
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		filterFn: "inNumberRange",
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
