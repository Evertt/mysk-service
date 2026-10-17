/**
 * Domain enums shared by the database schema, the seed script and the UI. Kept out of
 * `$lib/server` so client code (filters, badges) can import the option lists.
 */
import type { ModuleAction } from "#lib/modules/manifests.ts";

export const customerSegments = ["enterprise", "mid_market", "small_business"] as const;
export type CustomerSegment = (typeof customerSegments)[number];

export const engineerSpecialties = [
	"electrical",
	"mechanical",
	"hvac",
	"plumbing",
	"controls",
] as const;
export type EngineerSpecialty = (typeof engineerSpecialties)[number];

export const equipmentStatuses = [
	"operational",
	"needs_service",
	"out_of_service",
	"decommissioned",
] as const;
export type EquipmentStatus = (typeof equipmentStatuses)[number];

/**
 * In the order people pick them: breakdowns (SHLTR's "storing") are half the work, repairs a
 * quarter. An urgent breakdown ("storing prio") is a breakdown with priority `urgent`.
 */
export const orderTypes = [
	"breakdown",
	"repair",
	"maintenance",
	"inspection",
	"installation",
	"survey",
	"damage",
	"project",
	"other",
] as const;
export type OrderType = (typeof orderTypes)[number];

/**
 * Corrective work, putting right what went wrong with a unit: a breakdown it was called out for,
 * or a repair. A unit's time between repairs counts these, and so does a contract's response time.
 * Not damage, which an accident or a third party caused, not the unit.
 */
export const correctiveOrderTypes = ["breakdown", "repair"] as const satisfies OrderType[];

export const isCorrectiveWork = (type: OrderType) =>
	(correctiveOrderTypes as readonly OrderType[]).includes(type);

/**
 * In workflow order. An order a customer reports in the customer portal starts `awaiting_acceptance`
 * ("Nieuw (te accepteren)"): it waits for a planner to accept it (it's then a quote, or scheduled if
 * they plan it at once) or reject it (cancelled, with the reason shown to the customer). Until then
 * it's no open work: off the planning board and its backlog, holding no stock, and changed by
 * nothing but accepting, rejecting or deleting it (`acceptance.ts` in `#lib/orders/server/`).
 * Orders made in the office start as quotes, past acceptance.
 */
export const orderStatuses = [
	"awaiting_acceptance",
	"quote",
	"scheduled",
	"in_progress",
	"completed",
	"invoiced",
	"cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

/** Orders still to be done: quoted, scheduled or under way (accepted, so not awaiting acceptance). */
export const openOrderStatuses = [
	"quote",
	"scheduled",
	"in_progress",
] as const satisfies OrderStatus[];

/** Orders whose work is done, and which count towards revenue. */
export const doneOrderStatuses = ["completed", "invoiced"] as const satisfies OrderStatus[];

export const isOpenOrder = (status: OrderStatus) =>
	(openOrderStatuses as readonly OrderStatus[]).includes(status);

/** Whether an order is a customer's report that a planner hasn't accepted or rejected yet. */
export const isAwaitingAcceptance = (status: OrderStatus) => status === "awaiting_acceptance";

/**
 * Orders still to be done as the customer sees them in their portal: also those they reported that
 * aren't accepted yet.
 */
export const pendingOrderStatuses = [
	"awaiting_acceptance",
	...openOrderStatuses,
] as const satisfies OrderStatus[];

export const isDoneOrder = (status: OrderStatus) =>
	(doneOrderStatuses as readonly OrderStatus[]).includes(status);

/**
 * The statuses an order can be given by hand, e.g. in the order form. Not `invoiced`: an order is
 * invoiced when an invoice for it is issued, and completed again if that invoice is voided.
 */
export const manualOrderStatuses = [
	"quote",
	"scheduled",
	"in_progress",
	"completed",
	"cancelled",
] as const satisfies OrderStatus[];

/**
 * Whether an order can still be changed or deleted. Not once it's invoiced: it's on an invoice
 * that has been sent, with its amounts, so its status, lines, hours and engineer stay as they are.
 * (An order awaiting acceptance can be deleted, but changed only by accepting or rejecting it.)
 */
export const isEditableOrder = (status: OrderStatus) => status !== "invoiced";

/**
 * The statuses an order with `status` can be given by hand (its own among them), e.g. from the
 * status in the orders list: any of `manualOrderStatuses`; none once it's invoiced, nor while it
 * awaits acceptance (it's accepted or rejected instead).
 */
export const orderStatusChoices = (status: OrderStatus): readonly OrderStatus[] =>
	isEditableOrder(status) && !isAwaitingAcceptance(status) ? manualOrderStatuses : [];

/** How urgent a customer says their breakdown is, in the portal: the order's priority. */
export const reportUrgencies = [
	"normal",
	"high",
	"urgent",
] as const satisfies readonly OrderPriority[];

export const orderPriorities = ["low", "normal", "high", "urgent"] as const;
export type OrderPriority = (typeof orderPriorities)[number];

// --- Activity log ------------------------------------------------------------------------------

/**
 * What someone did to a record in the activity log (`activity`): created, updated or deleted it,
 * or a domain verb that says more, e.g. scheduled an order. A new
 * verb also gets a phrase in `actionVerbs` in `#lib/activity/subjects.ts`. These are the core's; an optional
 * module's verbs (e.g. invoicing's `issued`) are its `actions` in `#lib/modules/manifests.ts`.
 */
export const activityActions = [
	"created",
	"updated",
	"deleted",
	"scheduled",
	"module_enabled",
	"module_disabled",
	// The engineer portal.
	"work_started",
	"note_added",
	"completed",
	// Members and invitations.
	"removed",
	"sent",
	"resent",
	"cancelled",
	"accepted",
	// The orders customers report in the customer portal (and its access is `revoked`, below).
	"rejected",
	// Saved views shared with the organization.
	"shared",
	"unshared",
	// Integration tokens (`#lib/server/auth/integrations.ts`), and customers' portal access.
	"revoked",
] as const;
export type CoreActivityAction = (typeof activityActions)[number];
export type ActivityAction = CoreActivityAction | ModuleAction;

// --- Customer sites ------------------------------------------------------------------------------

/** How a site (`customer_site`) prefers to be contacted, e.g. to agree a visit. */
export const contactChannels = ["email", "phone", "whatsapp", "portal"] as const;
export type ContactChannel = (typeof contactChannels)[number];

/** The days of the week, Monday first, e.g. a site's preferred day for visits. */
export const weekdays = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
] as const;
export type Weekday = (typeof weekdays)[number];

/** How urgently a site's work is handled, besides each order's own priority. */
export const sitePriorities = ["normal", "high"] as const;
export type SitePriority = (typeof sitePriorities)[number];
