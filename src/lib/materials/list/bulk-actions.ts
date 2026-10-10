/** The materials list's bulk actions (see `#lib/components/data-table/bulk-actions.ts`). */
import Trash2Icon from "@lucide/svelte/icons/trash-2";

import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.ts";

import type { MaterialRow } from "./columns.ts";
import { bulkDeleteMaterials, getMaterialFacets, getMaterials } from "./material-list.remote.ts";

export const deleteMaterials: BulkAction<MaterialRow, AnyListWhere> = {
	id: "delete",
	label: m.common_delete,
	icon: Trash2Icon,
	destructive: true,
	skip: (row) => (row.orderCount ? m.materials_bulk_in_use({ name: row.name }) : undefined),
	confirm: {
		title: () => m.materials_bulk_delete_title(),
		description: m.materials_bulk_delete_description,
	},
	run: (target) => bulkDeleteMaterials(target).updates(getMaterials, getMaterialFacets),
	done: m.common_bulk_deleted,
};
