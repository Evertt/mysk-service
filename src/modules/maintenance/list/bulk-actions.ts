/** The due list's bulk action (see `#lib/components/data-table/bulk-actions.ts`): "Create orders". */
import ClipboardPlusIcon from "@lucide/svelte/icons/clipboard-plus";

import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.ts";

import type { DueRow } from "./columns.ts";
import { createDueOrders, getDueFacets, getDuePlans } from "./due-list.remote.ts";

/** An order for each selected plan, each plan moving on one interval. */
export const createOrdersAction: BulkAction<DueRow, AnyListWhere> = {
	id: "create-orders",
	label: m.maintenance_bulk_create,
	icon: ClipboardPlusIcon,
	confirm: {
		title: (count) =>
			m.maintenance_bulk_create_title({ plans: m.maintenance_count_plans({ count }) }),
		description: m.maintenance_bulk_create_description,
	},
	run: (target) => createDueOrders(target).updates(getDuePlans, getDueFacets),
	done: m.maintenance_bulk_created,
};
