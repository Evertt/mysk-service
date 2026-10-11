/**
 * The one way to create orders: the order form (`createOrder` in `../order.remote.ts`) and the
 * modules (e.g. maintenance plans turning what's due into orders) both call `createOrders()`, so
 * every new order is checked, numbered, logged and announced the same way.
 */
import { invalid } from "@sveltejs/kit";

import type { OrderPriority, OrderStatus, OrderType } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idsInTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { nextNumber } from "#lib/server/numbering.ts";

import { orderCommitted } from "./hooks.ts";

/** A new order's fields, without its number and tenant, which `createOrders()` gives it. */
export interface OrderDraft {
	customerId: number;
	/** One of the customer's units, if the order is about one. */
	equipmentId?: number | null;
	engineerId?: number | null;
	type: OrderType;
	/** `quote` if not given, as the order form starts. */
	status?: Exclude<OrderStatus, "invoiced">;
	/** `normal` if not given, as the order form starts. */
	priority?: OrderPriority;
	description: string;
	scheduledFor?: Date | null;
	completedAt?: Date | null;
	laborHours?: number;
}

/** What's wrong with a draft's references, by field. */
export interface DraftProblem {
	/** The draft's index in the batch. */
	draft: number;
	field: "customerId" | "equipmentId" | "engineerId";
	message: string;
}

const unique = (ids: (number | null | undefined)[]) => [
	...new Set(ids.filter((id): id is number => typeof id === "number")),
];

/**
 * Checks that the drafts' customers, units and engineers are the current tenant's, and that each
 * unit belongs to its draft's customer. One query per kind of reference, whatever the batch's size.
 */
export async function orderDraftProblems(
	tx: Transaction,
	drafts: readonly OrderDraft[],
): Promise<DraftProblem[]> {
	const customerIds = unique(drafts.map((draft) => draft.customerId));
	const unitIds = unique(drafts.map((draft) => draft.equipmentId));
	const engineerIds = unique(drafts.map((draft) => draft.engineerId));
	const [customers, units, engineers] = await Promise.all([
		customerIds.length
			? tx.select({ id: customer.id }).from(customer).where(idsInTenant(customer, customerIds))
			: [],
		unitIds.length
			? tx
					.select({ id: equipment.id, customerId: equipment.customerId })
					.from(equipment)
					.where(idsInTenant(equipment, unitIds))
			: [],
		engineerIds.length
			? tx.select({ id: engineer.id }).from(engineer).where(idsInTenant(engineer, engineerIds))
			: [],
	]);
	const knownCustomers = new Set(customers.map((row) => row.id));
	const ownerOf = new Map(units.map((row) => [row.id, row.customerId]));
	const knownEngineers = new Set(engineers.map((row) => row.id));

	return drafts.flatMap((draft, index): DraftProblem[] => {
		const problems: DraftProblem[] = [];
		if (!knownCustomers.has(draft.customerId)) {
			problems.push({ draft: index, field: "customerId", message: m.orders_unknown_customer() });
		}
		if (draft.equipmentId && ownerOf.get(draft.equipmentId) !== draft.customerId) {
			problems.push({
				draft: index,
				field: "equipmentId",
				message: m.orders_equipment_other_customer(),
			});
		}
		if (draft.engineerId && !knownEngineers.has(draft.engineerId)) {
			problems.push({ draft: index, field: "engineerId", message: m.orders_unknown_engineer() });
		}
		return problems;
	});
}

/**
 * Creates orders in the current tenant, in `tx`: checks their references (refusing the lot with
 * `invalid()` if any is wrong, so a form shows why and a bulk command skips the record with the
 * reason), gives each the tenant's next number, inserts them, logs each one's `created` and, once
 * `tx` has committed, lets the modules know (`orderCommitted()`). Returns their ids and numbers, in
 * the drafts' order. Material lines aren't part of a draft: save them with `saveOrderLines()`
 * afterwards, in the same transaction.
 */
export async function createOrders(
	tx: Transaction,
	drafts: readonly OrderDraft[],
): Promise<{ id: number; number: string }[]> {
	if (!drafts.length) return [];
	const problems = await orderDraftProblems(tx, drafts);
	if (problems.length) invalid(...new Set(problems.map((problem) => problem.message)));

	const { organizationId } = currentTenant();
	const created: { id: number; number: string }[] = [];
	for (const draft of drafts) {
		const values = { status: "quote" as const, priority: "normal" as const, ...draft };
		// One at a time: each number follows the one inserted before it.
		const number = await nextNumber(tx, "order");
		const [inserted] = await tx
			.insert(order)
			.values({ ...values, organizationId, number })
			.returning({ id: order.id });
		const subject = { type: "order", id: inserted.id, label: number };
		await recordActivity(tx, { action: "created", subject, after: values });
		created.push({ id: inserted.id, number });
	}
	for (const { number } of created) orderCommitted({ number });
	return created;
}
