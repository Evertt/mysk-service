import { renderComponent } from "@tanstack/svelte-table";

import { createAppColumnHelper } from "#lib/components/data-table/table.svelte.ts";
import TwoLineCell from "#lib/components/data-table/two-line-cell.svelte";
import { CustomerLink } from "#lib/customers/components.ts";
import { EquipmentLink } from "#lib/equipment/components.ts";
import { unitTitle } from "#lib/equipment/index.ts";

import { unitStatusDisplay } from "../display.ts";
import { type Concern, type ScoreBand, unitStatuses } from "../model.ts";
import ConditionBar from "../ui/condition-bar.svelte";
import InspectionBadge from "../ui/inspection-badge.svelte";
import StatusBadge from "../ui/status-badge.svelte";
import type { getConditionUnits } from "./units-list.remote.ts";
import { scoreBands } from "./units-list.ts";

/** A row of the Connect page's list, a page of which comes from the server (see `conditionList`). */
type ConditionRow = Awaited<ReturnType<typeof getConditionUnits>>["rows"][number];

const column = createAppColumnHelper<ConditionRow>();

export const columns = column.columns([
	column.accessor((row) => row.component?.name ?? null, {
		id: "component",
		cell: ({ row }) => {
			const part = row.original.component;
			return part
				? renderComponent(TwoLineCell, {
						primary: part.name,
						secondary: [part.number, part.sku && m.condition_component_article({ sku: part.sku })]
							.filter(Boolean)
							.join(" · "),
					})
				: // A unit without components: its own row, as a whole.
					renderComponent(TwoLineCell, {
						primary: null,
						fallback: m.condition_component_whole_unit(),
					});
		},
		enableHiding: false,
		meta: { label: m.condition_column_component },
	}),
	column.accessor((row) => unitTitle(row), {
		id: "unit",
		cell: ({ getValue, row }) =>
			renderComponent(EquipmentLink, {
				serialNumber: row.original.serialNumber,
				label: getValue(),
				secondary: [row.original.location?.name, row.original.site].filter(Boolean).join(" · "),
			}),
		enableHiding: false,
		meta: { label: m.condition_column_unit },
	}),
	column.accessor((row) => row.customer.name, {
		id: "customer",
		cell: ({ row }) =>
			renderComponent(CustomerLink, {
				name: row.original.customer.name,
				code: row.original.customer.code,
			}),
		// By the customer's code, e.g. `?customer=RIE-001`.
		filterFn: (row, _id, codes: string[]) => codes.includes(row.original.customer.code),
		meta: { label: m.condition_column_customer, filter: "set" },
	}),
	column.accessor("score", {
		id: "condition",
		cell: ({ getValue, row }) =>
			renderComponent(ConditionBar, {
				score: getValue(),
				band: row.original.band === "none" ? null : (row.original.band as ScoreBand),
			}),
		sortUndefined: "last",
		enableGlobalFilter: false,
		filterFn: "oneOf",
		meta: { label: m.condition_column_condition, filter: "set", filterValues: scoreBands },
	}),
	column.accessor("lastService", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.condition_column_last_service, param: "last-service" },
	}),
	column.accessor("nextDue", {
		cell: ({ cell }) => renderComponent(cell.DateCell),
		enableGlobalFilter: false,
		meta: { label: m.condition_column_next_due, param: "next-due" },
	}),
	column.accessor("inspection", {
		cell: ({ getValue }) => renderComponent(InspectionBadge, { status: getValue() }),
		enableGlobalFilter: false,
		meta: { label: m.condition_column_inspection },
	}),
	column.enum("status", {
		values: unitStatuses,
		display: unitStatusDisplay,
		// With the mark of what a planned unit's condition asks for.
		cell: ({ getValue, row }) =>
			renderComponent(StatusBadge, {
				status: getValue()!,
				concern: row.original.concern as Concern,
			}),
		enableGrouping: false,
		enableGlobalFilter: false,
		meta: { label: m.condition_column_status },
	}),
	column.accessor("advice", {
		cell: ({ getValue }) => getValue() ?? "",
		enableSorting: false,
		enableGlobalFilter: false,
		meta: { label: m.condition_column_advice },
	}),
]);
