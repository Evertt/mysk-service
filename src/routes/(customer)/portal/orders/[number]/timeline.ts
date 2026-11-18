/**
 * The steps of an order's timeline on its page in the customer portal, as SHLTR's customers follow a
 * fault they reported: received, an engineer scheduled, the engineer on the way, resolved; or, for
 * a report rejected or an order cancelled, received and that end. Pure: `<OrderTimeline>` words and
 * draws them.
 */
import type { OrderStatus } from "#lib/models.ts";

import { clientStatus } from "../../client-status.ts";

/** A step of the timeline, in its order. */
export type TimelineStepKey =
	| "received"
	| "scheduled"
	| "on_the_way"
	| "resolved"
	| "rejected"
	| "cancelled";

/** Where a step stands: behind the order, where it is now, still to come, or where it ended. */
export type StepState = "done" | "current" | "upcoming" | "ended";

/** What a step says under its title, besides when it happened. */
export type StepDetail =
	/** Received, waiting for the tenant to accept it. */
	| { kind: "awaiting" }
	/** Accepted on a day, an engineer being planned. */
	| { kind: "accepted"; at: Temporal.Instant | null }
	/** Planned for a time, with the engineer's first name if known. */
	| { kind: "planned"; at: Temporal.Instant | null; engineer: string | null }
	/** The engineer is at work. */
	| { kind: "in_progress" }
	/** The planner's reason for rejecting the report. */
	| { kind: "reason"; reason: string }
	| null;

export interface TimelineStep {
	key: TimelineStepKey;
	state: StepState;
	/** When it happened, if it did and that's known. */
	at: Temporal.Instant | null;
	detail: StepDetail;
}

/** What the timeline is made of: the order as the portal reads it, and when it moved in the field. */
export interface TimelineOrder {
	status: OrderStatus;
	createdAt: Temporal.Instant;
	scheduledFor: Temporal.Instant | null;
	completedAt: Temporal.Instant | null;
	/** When a planner decided on the report (accepted or rejected it); none if it wasn't one. */
	decidedAt: Temporal.Instant | null;
	rejectionReason: string | null;
	/** The engineer's first name, if it has one. */
	engineer: string | null;
	/** When the engineer last set out for it (from the activity log), if they did. */
	departedAt: Temporal.Instant | null;
}

/** The timeline's steps for `order`, in their order. */
export function timelineSteps(order: TimelineOrder): TimelineStep[] {
	const status = clientStatus(order.status, order.rejectionReason);
	const received: TimelineStep = {
		key: "received",
		state: "done",
		at: order.createdAt,
		detail: status === "awaiting" ? { kind: "awaiting" } : null,
	};
	if (status === "rejected" || status === "cancelled") {
		const reason = status === "rejected" ? order.rejectionReason : null;
		return [
			received,
			{
				key: status,
				state: "ended",
				at: status === "rejected" ? order.decidedAt : null,
				detail: reason ? { kind: "reason", reason } : null,
			},
		];
	}
	const planned = status !== "awaiting" && status !== "accepted";
	const underWay = status === "in_progress" || status === "done";
	return [
		received,
		{
			key: "scheduled",
			state: planned ? "done" : status === "accepted" ? "current" : "upcoming",
			at: null,
			detail: planned
				? { kind: "planned", at: order.scheduledFor, engineer: order.engineer }
				: status === "accepted"
					? { kind: "accepted", at: order.decidedAt }
					: null,
		},
		{
			key: "on_the_way",
			state: status === "on_the_way" ? "current" : underWay ? "done" : "upcoming",
			// When they set out; none if they started without saying so.
			at: status === "on_the_way" || underWay ? order.departedAt : null,
			detail: null,
		},
		{
			key: "resolved",
			state: status === "done" ? "done" : status === "in_progress" ? "current" : "upcoming",
			at: status === "done" ? order.completedAt : null,
			detail: status === "in_progress" ? { kind: "in_progress" } : null,
		},
	];
}
