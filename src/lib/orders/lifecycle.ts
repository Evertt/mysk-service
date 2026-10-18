/**
 * An order's lifecycle: which status can follow which, for whom. The server's moves
 * (`#lib/orders/server/lifecycle.ts`) and the pages' buttons go by these same rules.
 */
import {
	isAwaitingAcceptance,
	isEditableOrder,
	manualOrderStatuses,
	type OrderStatus,
	orderStatuses,
} from "#lib/models.ts";

/** Who moves an order from one status to another. */
type OrderActor = "office" | "planner" | "acceptance" | "engineer" | "invoicing";

/** A transition: who makes it, from which statuses, and to which. */
interface TransitionRule {
	by: OrderActor;
	from: readonly OrderStatus[];
	to: readonly OrderStatus[];
}

/**
 * Every way an order's status changes, by its verb. The rows are the only place that says which
 * status may follow which, and for whom: the rules below and the server's moves read them.
 */
const orderTransitions = {
	/** The office gives it a status by hand (the order form, the list's status, bulk). */
	set: {
		by: "office",
		from: orderStatuses.filter(
			(status) => isEditableOrder(status) && !isAwaitingAcceptance(status),
		),
		to: manualOrderStatuses,
	},
	/** The engineer starts a scheduled job. */
	start: { by: "engineer", from: ["scheduled"], to: ["in_progress"] },
	/** The engineer completes the job under way, with the customer's sign-off. */
	complete: { by: "engineer", from: ["in_progress"], to: ["completed"] },
} as const satisfies Record<string, TransitionRule>;

/** A way an order's status changes (see `orderTransitions`). */
export type OrderVerb = keyof typeof orderTransitions;

/** Whether `verb` can move an order with `status` (whatever it moves it to). */
const can = (verb: OrderVerb, status: OrderStatus) =>
	(orderTransitions[verb].from as readonly OrderStatus[]).includes(status);

/** The page's Edit button and the order form: whether an order can be changed in its status. */
export const mayEditOrder = (status: OrderStatus) => can("set", status);

/**
 * The page's Delete button: whether an order can be deleted in its status. Not once it's invoiced;
 * an order awaiting acceptance can be (it isn't accepted first).
 */
export const mayDeleteOrder = (status: OrderStatus) => isEditableOrder(status);

/**
 * The statuses an order with `status` can be given by hand (its own among them), e.g. from the
 * status in the orders list: any of `manualOrderStatuses`; none once it's invoiced, nor while it
 * awaits acceptance (it's accepted or rejected instead).
 */
export const statusChoices = (status: OrderStatus): readonly OrderStatus[] =>
	can("set", status) ? orderTransitions.set.to : [];

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
		start: can("start", status),
		/** Log hours and materials, and complete it with the customer's sign-off. */
		work: can("complete", status),
		/** Write a note, e.g. about access or what they found. */
		note: can("start", status) || can("complete", status),
	};
}

/** Something an engineer can do with one of their orders (see `fieldActions`). */
export type FieldAction = keyof ReturnType<typeof fieldActions>;
