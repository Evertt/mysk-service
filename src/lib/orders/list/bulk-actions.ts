/**
 * The orders list's bulk actions (see `#lib/components/data-table/bulk-actions.ts`): assign an
 * engineer, change the status, delete. The tenant's modules add theirs (`orders.list` in
 * `#lib/orders/extensions.ts`), e.g. invoicing's "Create invoice".
 */
import CircleDotIcon from "@lucide/svelte/icons/circle-dot";
import Trash2Icon from "@lucide/svelte/icons/trash-2";
import UserRoundCheckIcon from "@lucide/svelte/icons/user-round-check";

import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.ts";
import { labelOptions } from "#lib/i18n/index.ts";
import { isEditableOrder, manualOrderStatuses } from "#lib/models.ts";

import type { OrderBulkRow } from "../extensions.ts";
import {
	bulkAssignOrders,
	bulkDeleteOrders,
	bulkSetOrderStatus,
	getAssignableEngineers,
} from "./order-bulk.remote.ts";
import { getOrderFacets, getOrders } from "./order-list.remote.ts";

/** An invoiced order stays as it is (see `isEditableOrder`). */
const invoiced = (row: OrderBulkRow) =>
	isEditableOrder(row.status) ? undefined : m.orders_invoiced_title({ number: row.number });

const orders = (count: number) => m.common_count_orders({ count });

/** Value of the "Unassigned" choice. */
const NOBODY = "none";

export const assignEngineer: BulkAction<OrderBulkRow, AnyListWhere> = {
	id: "assign",
	label: m.orders_bulk_assign,
	icon: UserRoundCheckIcon,
	skip: invoiced,
	parameter: {
		label: m.orders_field_engineer,
		title: (count) => m.orders_bulk_assign_title({ orders: orders(count) }),
		description: m.orders_bulk_assign_description,
		options: async () => [
			{ value: NOBODY, label: m.common_unassigned() },
			...(await getAssignableEngineers()).map((e) => ({ value: String(e.id), label: e.name })),
		],
	},
	run: (target, value) =>
		bulkAssignOrders({ target, engineerId: value === NOBODY ? null : Number(value) }).updates(
			getOrders,
			getOrderFacets,
		),
};

export const changeStatus: BulkAction<OrderBulkRow, AnyListWhere> = {
	id: "status",
	label: m.orders_bulk_status,
	icon: CircleDotIcon,
	skip: invoiced,
	// A row's status is changed right in its cell (`status-cell.svelte`).
	row: false,
	parameter: {
		label: m.orders_field_status,
		title: (count) => m.orders_bulk_status_title({ orders: orders(count) }),
		description: m.orders_bulk_status_description,
		options: () => labelOptions("orderStatus", manualOrderStatuses),
	},
	run: (target, value) =>
		bulkSetOrderStatus({
			target,
			status: value as (typeof manualOrderStatuses)[number],
		}).updates(getOrders, getOrderFacets),
};

export const deleteOrders: BulkAction<OrderBulkRow, AnyListWhere> = {
	id: "delete",
	label: m.common_delete,
	icon: Trash2Icon,
	destructive: true,
	skip: (row) =>
		isEditableOrder(row.status) ? undefined : m.orders_invoiced_title({ number: row.number }),
	confirm: {
		title: (count) => m.orders_bulk_delete_title({ orders: orders(count) }),
		description: m.orders_bulk_delete_description,
	},
	run: (target) => bulkDeleteOrders(target).updates(getOrders, getOrderFacets),
	done: m.common_bulk_deleted,
};
