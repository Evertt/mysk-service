import { resolve } from "$app/paths";
import { renderComponent } from "@tanstack/svelte-table";

import { withListColumns } from "#lib/components/data-table/list-definition.ts";
import RowActions from "#lib/components/data-table/row-actions.svelte";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { CustomerLink } from "#lib/customers/components.ts";
import { equipmentStatuses } from "#lib/models.ts";

import { unitLine, unitTitle, equipmentStatusDisplay } from "../display.ts";
import EquipmentLink from "../ui/equipment-link.svelte";
import type { getEquipmentList } from "./equipment-list.remote.ts";
import { equipmentList } from "./equipment-list.ts";
import WarrantyCell from "./warranty-cell.svelte";

/** A row of the equipment list, a page of which comes from the server (see `equipmentList`). */
export type EquipmentRow = Awaited<ReturnType<typeof getEquipmentList>>["rows"][number];

const column = createAppColumnHelper<EquipmentRow>();

export const columns = withListColumns(equipmentList, {
	select: column.select(),
	unit: column.accessor((row) => unitTitle(row), {
		id: "unit",
		cell: ({ getValue, row }) =>
			renderComponent(EquipmentLink, {
				serialNumber: row.original.serialNumber,
				label: getValue(),
				// The make too, under the customer's own name for it.
				secondary: unitLine(row.original),
			}),
		enableHiding: false,
		meta: { label: m.equipment_column_unit },
	}),
	// Hidden: makes serial numbers searchable.
	serialNumber: column.accessor("serialNumber", {
		enableHiding: false,
		meta: { label: m.equipment_column_serial_number },
	}),
	// Hidden: for the manufacturer filter, and to group by.
	manufacturer: column.accessor("manufacturer", {
		enableHiding: false,
		meta: {
			label: m.equipment_column_manufacturer,
			// Imported units may have none.
			none: m.equipment_manufacturer_none,
			groupLabel: (manufacturer) => String(manufacturer ?? "") || m.equipment_manufacturer_none(),
		},
	}),
	// One of the tenant's categories, shown by name, filtered and grouped by id (`?category=3`).
	category: column.accessor((row) => row.category.name, {
		id: "category",
		getGroupingValue: (row) => row.category.id,
		meta: { label: m.equipment_column_category },
	}),
	status: column.enum("status", {
		values: equipmentStatuses,
		display: equipmentStatusDisplay,
		meta: { label: m.equipment_column_status },
	}),
	customer: column.accessor((row) => row.customer.name, {
		id: "customer",
		cell: ({ row }) =>
			renderComponent(CustomerLink, {
				name: row.original.customer.name,
				code: row.original.customer.code,
				withCode: true,
			}),
		// By the customer's code, e.g. `?customer=CUST-0001`.
		getGroupingValue: (row) => row.customer.code,
		meta: { label: m.equipment_column_customer },
	}),
	site: column.accessor((row) => row.site.name, {
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
	location: column.accessor((row) => row.location?.name, {
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
		getGroupingValue: (row) => row.location?.id,
		meta: { label: m.equipment_column_location, none: m.equipment_location_none },
	}),
	installedAt: column.accessor("installedAt", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.equipment_column_installed },
	}),
	warrantyUntil: column.accessor("warrantyUntil", {
		cell: ({ getValue }) => renderComponent(WarrantyCell, { until: getValue() }),
		enableGlobalFilter: false,
		meta: { label: m.equipment_column_warranty },
	}),
	openOrders: column.accessor("openOrders", {
		cell: ({ cell }) => renderComponent(cell.NumberCell),
		enableGlobalFilter: false,
		meta: { label: m.equipment_column_open_orders, align: "end" },
	}),
	actions: column.display({
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
});
