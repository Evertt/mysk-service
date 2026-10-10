/** The customers list's bulk actions (see `#lib/components/data-table/bulk-actions.ts`). */
import Trash2Icon from "@lucide/svelte/icons/trash-2";

import type { BulkAction } from "#lib/components/data-table/bulk-actions.ts";

import { bulkDeleteCustomers } from "../customers.remote.ts";
import type { CustomerRow } from "./columns.ts";

// Whether a customer has orders (closed ones too), only the server knows.
export const deleteCustomers: BulkAction<CustomerRow> = {
	id: "delete",
	label: m.common_delete,
	icon: Trash2Icon,
	destructive: true,
	skip: (row) =>
		row.equipmentCount ? m.customers_bulk_has_equipment({ name: row.name }) : undefined,
	confirm: {
		title: () => m.customers_bulk_delete_title(),
		description: m.customers_bulk_delete_description,
	},
	run: (target) => bulkDeleteCustomers(target),
	done: m.common_bulk_deleted,
};
