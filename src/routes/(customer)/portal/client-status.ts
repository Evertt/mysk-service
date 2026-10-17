/**
 * Where an order stands as the customer reads it in their portal, in SHLTR's words: a report not
 * accepted yet ("Opdracht nog niet geaccepteerd"), accepted ("Opdracht geaccepteerd", a quote to
 * the office), planned, under way, done; or rejected ("Afgewezen", with the planner's reason) or
 * cancelled. Pure, for the portal's pages.
 */
import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
import CircleSlashIcon from "@lucide/svelte/icons/circle-slash";
import CircleXIcon from "@lucide/svelte/icons/circle-x";
import HourglassIcon from "@lucide/svelte/icons/hourglass";
import ThumbsUpIcon from "@lucide/svelte/icons/thumbs-up";
import TimerIcon from "@lucide/svelte/icons/timer";
import type { Component } from "svelte";

import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import type { OrderStatus } from "#lib/models.ts";

export const clientStatuses = [
	"awaiting",
	"accepted",
	"scheduled",
	"in_progress",
	"done",
	"rejected",
	"cancelled",
] as const;
export type ClientStatus = (typeof clientStatuses)[number];

/**
 * An order's status as the customer reads it: `rejected` for a cancelled order a planner rejected
 * (it has a rejection reason), `cancelled` for one cancelled otherwise.
 */
export function clientStatus(status: OrderStatus, rejectionReason: string | null): ClientStatus {
	switch (status) {
		case "awaiting_acceptance":
			return "awaiting";
		case "quote":
			return "accepted";
		case "scheduled":
		case "in_progress":
			return status;
		case "completed":
		case "invoiced":
			return "done";
		case "cancelled":
			return rejectionReason === null ? "cancelled" : "rejected";
	}
}

/** Each status's label (read when shown), icon and badge tone. */
export const clientStatusDisplay: Record<
	ClientStatus,
	{ label: () => string; icon: Component; tone: BadgeTone }
> = {
	awaiting: { label: m.client_status_awaiting, icon: HourglassIcon, tone: "warning" },
	accepted: { label: m.client_status_accepted, icon: ThumbsUpIcon, tone: "info" },
	scheduled: { label: m.client_status_scheduled, icon: CalendarClockIcon, tone: "info" },
	in_progress: { label: m.client_status_in_progress, icon: TimerIcon, tone: "warning" },
	done: { label: m.client_status_done, icon: CircleCheckIcon, tone: "success" },
	rejected: { label: m.client_status_rejected, icon: CircleXIcon, tone: "danger" },
	cancelled: { label: m.client_status_cancelled, icon: CircleSlashIcon, tone: "neutral" },
};
