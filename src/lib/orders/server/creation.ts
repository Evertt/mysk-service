/**
 * The one way to create orders: the order form (`createOrder` in `../order.remote.ts`) and the
 * modules (e.g. maintenance plans turning what's due into orders) both call `createOrders()`, so
 * every new order is checked, numbered and logged the same way.
 */
import { invalid } from "@sveltejs/kit";

import { orderSubject } from "#lib/activity/index.ts";
import type { OrderPriority, OrderStatus, OrderType } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idsInTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { nextNumber } from "#lib/server/numbering.ts";

import { setOrderUnits } from "./units.ts";

/** A new order's fields, without its number and tenant, which `createOrders()` gives it. */
export interface OrderDraft {
	customerId: number;
	/**
	 * The customer's units it's about, by id, in the order they're worked on: none for a new
	 * installation or a survey (and if not given).
	 */
	units?: readonly number[];
	engineerId?: number | null;
	type: OrderType;
	/** `quote` if not given, as the order form starts. */
	status?: Exclude<OrderStatus, "invoiced">;
	/** `normal` if not given, as the order form starts. */
	priority?: OrderPriority;
	description: string;
	scheduledFor?: Temporal.Instant | null;
	completedAt?: Temporal.Instant | null;
	laborHours?: number;
}

/** What's wrong with a draft's references, by field. */
interface DraftProblem {
	/** The draft's index in the batch. */
	draft: number;
	field: "customerId" | "equipmentIds" | "engineerId";
	message: string;
}

const unique = (ids: (number | null | undefined)[]) => [
	...new Set(ids.filter((id): id is number => typeof id === "number")),
];

/**
 * Checks that the drafts' customers, units and engineers are the current tenant's, and that each
 * unit belongs to its draft's customer. One query per kind of reference, whatever the batch's size.
 */
async function orderDraftProblems(
	tx: Transaction,
	drafts: readonly OrderDraft[],
): Promise<DraftProblem[]> {
	const customerIds = unique(drafts.map((draft) => draft.customerId));
	const unitIds = unique(drafts.flatMap((draft) => draft.units ?? []));
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
		// Another tenant's unit is no unit of this customer's either.
		if (draft.units?.some((unit) => ownerOf.get(unit) !== draft.customerId)) {
			problems.push({
				draft: index,
				field: "equipmentIds",
				message: m.orders_units_other_customer(),
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
 * reason), gives each the tenant's next number, inserts them with their units and logs each one's
 * `created`. Returns their ids and numbers, in the drafts' order. What the modules add to an order
 * (e.g. its materials) isn't part of a draft: the order form saves its modules' parts right after,
 * in the same transaction (`saveOrderParts()`); an order made without them has none to save.
 *
 * It doesn't emit `orders.committed` (`orderCommitted()`), as core's create never did: that event
 * has the modules refresh their queries about an order on the client's pages, and a new order is on
 * none yet. Refreshing them anyway left them in the client, failing once the order was deleted (the
 * orders e2e caught it). A module that needs to hear about new orders gets an event of its own.
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
	for (const { units = [], ...draft } of drafts) {
		const values = { status: "quote" as const, priority: "normal" as const, ...draft };
		// One at a time: each number follows the one inserted before it.
		const number = await nextNumber(tx, "order");
		const [inserted] = await tx
			.insert(order)
			.values({ ...values, organizationId, number })
			.returning({ id: order.id });
		const equipmentIds = [...new Set(units)];
		await setOrderUnits(tx, { id: inserted.id, customerId: draft.customerId }, equipmentIds);
		const subject = orderSubject({ id: inserted.id, number });
		await recordActivity(tx, { action: "created", subject, after: { ...values, equipmentIds } });
		created.push({ id: inserted.id, number });
	}
	return created;
}
