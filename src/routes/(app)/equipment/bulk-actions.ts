/** The equipment list's bulk actions (see `#lib/components/data-table/bulk-actions.ts`). */
import CircleDotIcon from "@lucide/svelte/icons/circle-dot";
import Trash2Icon from "@lucide/svelte/icons/trash-2";

import type { BulkAction } from "#lib/components/data-table/bulk-actions.js";
import { statusOptions } from "#lib/components/equipment/display.js";
import type { EquipmentStatus } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";

import type { EquipmentRow } from "./columns.js";
import {
	bulkDeleteEquipment,
	bulkSetEquipmentStatus,
	getEquipmentFacets,
	getEquipmentList,
} from "./equipment-list.remote.js";

export const changeStatus: BulkAction<EquipmentRow> = {
	id: "status",
	label: m.equipment_bulk_status,
	icon: CircleDotIcon,
	parameter: {
		label: m.equipment_field_status,
		title: () => m.equipment_bulk_status_title(),
		options: () => statusOptions,
	},
	run: (target, value) =>
		bulkSetEquipmentStatus({ target, status: value as EquipmentStatus }).updates(
			getEquipmentList,
			getEquipmentFacets,
		),
};

// Whether a unit has orders (closed ones too), only the server knows.
export const deleteEquipment: BulkAction<EquipmentRow> = {
	id: "delete",
	label: m.common_delete,
	icon: Trash2Icon,
	destructive: true,
	confirm: {
		title: () => m.equipment_bulk_delete_title(),
		description: m.equipment_bulk_delete_description,
	},
	run: (target) => bulkDeleteEquipment(target).updates(getEquipmentList, getEquipmentFacets),
	done: m.common_bulk_deleted,
};
