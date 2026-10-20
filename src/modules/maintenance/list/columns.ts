import { renderComponent } from "@tanstack/svelte-table";

import { withListColumns } from "#lib/components/data-table/list-definition.ts";
import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { CustomerLink } from "#lib/customers/components.ts";
import { EquipmentLink } from "#lib/equipment/components.ts";
import { label } from "#lib/i18n/index.ts";
import { OrderLink } from "#lib/orders/components.ts";

import { planOrderTypes } from "../model.ts";
import NextDue from "../ui/next-due.svelte";
import type { getDuePlans } from "./due-list.remote.ts";
import { dueList } from "./due-list.ts";

/** A row of the due list, a page of which comes from the server (see `dueList`). */
export type DueRow = Awaited<ReturnType<typeof getDuePlans>>["rows"][number];

const column = createAppColumnHelper<DueRow>();

export const columns = withListColumns(dueList, {
	select: column.select(),
	unit: column.accessor((row) => `${row.unit.manufacturer} ${row.unit.model}`, {
		id: "unit",
		cell: ({ getValue, row }) =>
			renderComponent(EquipmentLink, {
				serialNumber: row.original.unit.serialNumber,
				label: getValue(),
				secondary: row.original.unit.serialNumber,
			}),
		enableHiding: false,
		meta: { label: m.maintenance_column_unit },
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
		meta: { label: m.maintenance_column_customer },
	}),
	plan: column.accessor("description", {
		id: "plan",
		cell: ({ getValue, row }) =>
			renderComponent(TwoLineCell, {
				primary: getValue(),
				secondary: label("orderType", row.original.orderType),
				// The order type, which the hidden `type` column filters by.
				secondaryFilter: {
					value: row.original.orderType,
					label: label("orderType", row.original.orderType),
					columnId: "type",
				},
			}),
		meta: { label: m.maintenance_column_plan },
	}),
	// Hidden: for the order type filter.
	type: column.enum("orderType", {
		id: "type",
		values: planOrderTypes,
		label: (type) => label("orderType", type),
		enableHiding: false,
		meta: { label: m.maintenance_field_order_type },
	}),
	interval: column.accessor("intervalMonths", {
		id: "interval",
		cell: ({ getValue }) => m.maintenance_every_months({ count: getValue() }),
		enableGlobalFilter: false,
		meta: { label: m.maintenance_column_interval },
	}),
	nextDue: column.accessor("nextDueOn", {
		id: "nextDue",
		cell: ({ getValue }) => renderComponent(NextDue, { value: getValue() }),
		enableGlobalFilter: false,
		meta: { label: m.maintenance_column_next_due },
	}),
	lastOrder: column.accessor("lastOrder", {
		cell: ({ getValue }) => {
			const number = getValue();
			return number ? renderComponent(OrderLink, { number }) : "—";
		},
		enableGlobalFilter: false,
		meta: { label: m.maintenance_column_last_order },
	}),
	// Hidden: the range of due dates (`?due=`), chosen in the toolbar.
	due: column.accessor("nextDueOn", {
		id: "due",
		enableHiding: false,
		enableGlobalFilter: false,
		meta: { label: m.maintenance_range },
	}),
});
