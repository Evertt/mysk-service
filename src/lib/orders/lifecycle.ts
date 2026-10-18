/**
 * An order's lifecycle: which status can follow which, for whom. The server's moves
 * (`#lib/orders/server/lifecycle.ts`) and the pages' buttons go by these same rules.
 */
import {
	isAwaitingAcceptance,
	isEditableOrder,
	manualOrderStatuses,
	type OrderStatus,
} from "#lib/models.ts";

/**
 * The statuses an order with `status` can be given by hand (its own among them), e.g. from the
 * status in the orders list: any of `manualOrderStatuses`; none once it's invoiced, nor while it
 * awaits acceptance (it's accepted or rejected instead).
 */
export const statusChoices = (status: OrderStatus): readonly OrderStatus[] =>
	isEditableOrder(status) && !isAwaitingAcceptance(status) ? manualOrderStatuses : [];

/**
 * The status an open order gets when it's planned: a quote that gets an engineer and a date is
 * scheduled (as in the seed data, where quotes have neither); other statuses stay as they are.
 * The scheduling service (`scheduleOrder()`) and the planning board's moves share it.
 */
export const plannedStatus = (status: OrderStatus, engineerId: number | null): OrderStatus =>
	status === "quote" && engineerId !== null ? "scheduled" : status;

/**
 * What an engineer can do in the field (the engineer portal) with one of their orders, by its
 * status. The portal and the modules that add to its order page (`portal.order`) go by it.
 */
export function fieldActions(status: OrderStatus) {
	return {
		/** Start the job: a scheduled order is then in progress. */
		start: status === "scheduled",
		/** Log hours and materials, and complete it with the customer's sign-off. */
		work: status === "in_progress",
		/** Write a note, e.g. about access or what they found. */
		note: status === "scheduled" || status === "in_progress",
	};
}

/** Something an engineer can do with one of their orders (see `fieldActions`). */
export type FieldAction = keyof ReturnType<typeof fieldActions>;
