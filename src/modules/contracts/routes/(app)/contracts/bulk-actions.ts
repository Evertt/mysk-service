/** The contracts list's bulk actions (see `#lib/components/data-table/bulk-actions.ts`). */
import Trash2Icon from "@lucide/svelte/icons/trash-2";

import type { BulkAction } from "#lib/components/data-table/bulk-actions.ts";
import { m } from "#lib/paraglide/messages.js";

import type { ContractRow } from "./columns.ts";
import { bulkDeleteContracts } from "./contracts.remote.ts";

export const deleteContracts: BulkAction<ContractRow> = {
	id: "delete",
	label: m.common_delete,
	icon: Trash2Icon,
	destructive: true,
	confirm: {
		title: () => m.contracts_bulk_delete_title(),
		description: m.contracts_bulk_delete_description,
	},
	run: (target) => bulkDeleteContracts(target),
	done: m.common_bulk_deleted,
};
