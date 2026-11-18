/**
 * Domain enums shared by the database schema, the seed script and the UI. Kept out of
 * `$lib/server` so client code (filters, badges) can import the option lists.
 */
import type { ModuleAction } from "#lib/modules/manifests.ts";
import { isOneOf } from "#lib/one-of.ts";

/** @labels customerSegment */
export const customerSegments = ["enterprise", "mid_market", "small_business"] as const;
export type CustomerSegment = (typeof customerSegments)[number];

/** @labels engineerSpecialty */
export const engineerSpecialties = [
	"electrical",
	"mechanical",
	"hvac",
	"plumbing",
	"controls",
] as const;
export type EngineerSpecialty = (typeof engineerSpecialties)[number];

/** @labels equipmentStatus */
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
 * @labels orderType
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

export const isCorrectiveWork = (type: OrderType) => isOneOf(correctiveOrderTypes, type);

/**
 * In workflow order. An order a customer reports in the customer portal starts `awaiting_acceptance`
 * ("Nieuw (te accepteren)"): it waits for a planner to accept it (it's then a quote, or scheduled if
 * they plan it at once) or reject it (cancelled, with the reason shown to the customer). Until then
 * it's no open work: off the planning board and its backlog, holding no stock, and changed by
 * nothing but accepting, rejecting or deleting it (`acceptance.ts` in `#lib/orders/server/`).
 * Orders made in the office start as quotes, past acceptance. A scheduled order's engineer tells
 * the customer they're `on_the_way` (from the engineer portal) before they start it, or starts it
 * at once.
 * @labels orderStatus
 */
export const orderStatuses = [
	"awaiting_acceptance",
	"quote",
	"scheduled",
	"on_the_way",
	"in_progress",
	"completed",
	"invoiced",
	"cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

/**
 * Orders still to be done: quoted, scheduled, the engineer on the way or under way (accepted, so
 * not awaiting acceptance).
 */
export const openOrderStatuses = [
	"quote",
	"scheduled",
	"on_the_way",
	"in_progress",
] as const satisfies OrderStatus[];

/**
 * The engineer's work list on the portal (`getMyWork`): their orders that are planned or under
 * way. A quote isn't work yet, though it is open (`openOrderStatuses`, what the orders at a scanned
 * place list). A view, not a permission: an engineer reads their orders in any status (the access
 * registry's `order` rule), a cancelled one their bell told them about included.
 */
export const engineerWorkStatuses = [
	"scheduled",
	"on_the_way",
	"in_progress",
] as const satisfies OrderStatus[];

/** Orders whose work is done, and which count towards revenue. */
export const doneOrderStatuses = ["completed", "invoiced"] as const satisfies OrderStatus[];

export const isOpenOrder = (status: OrderStatus) => isOneOf(openOrderStatuses, status);

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

export const isDoneOrder = (status: OrderStatus) => isOneOf(doneOrderStatuses, status);

/**
 * The statuses an order can be given by hand, e.g. in the order form. Not `invoiced`: an order is
 * invoiced when an invoice for it is issued, and completed again if that invoice is voided.
 */
export const manualOrderStatuses = [
	"quote",
	"scheduled",
	"on_the_way",
	"in_progress",
	"completed",
	"cancelled",
] as const satisfies OrderStatus[];
export type ManualOrderStatus = (typeof manualOrderStatuses)[number];

/**
 * Whether an order can still be changed or deleted. Not once it's invoiced: it's on an invoice
 * that has been sent, with its amounts, so its status, lines, hours and engineer stay as they are.
 * (An order awaiting acceptance can be deleted, but changed only by accepting or rejecting it.)
 */
export const isEditableOrder = (status: OrderStatus) => status !== "invoiced";

/** How urgent a customer says their breakdown is, in the portal: the order's priority. */
export const reportUrgencies = [
	"normal",
	"high",
	"urgent",
] as const satisfies readonly OrderPriority[];

/**
 * What kind of fault a customer reports in the portal ("Wat is er aan de hand?"), kept with the
 * report (`order_request.fault`) for the planner who reads it. Optional: `other` is for a fault the
 * chips don't name, none for a report that skipped them.
 * @labels reportFault
 */
export const reportFaults = ["door_wont_close", "damage", "noise", "other"] as const;
export type ReportFault = (typeof reportFaults)[number];

/** @labels orderPriority */
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
	// The engineer portal (`departed`: on the way to a scheduled order).
	"departed",
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
	// A demo's simulation put back in its starting states (`#lib/server/simulation.ts`).
	"reset",
] as const;
export type CoreActivityAction = (typeof activityActions)[number];
export type ActivityAction = CoreActivityAction | ModuleAction;

// --- Customer sites ------------------------------------------------------------------------------

/**
 * How a site (`customer_site`) prefers to be contacted, e.g. to agree a visit.
 * @labels contactChannel
 */
export const contactChannels = ["email", "phone", "whatsapp", "portal"] as const;
export type ContactChannel = (typeof contactChannels)[number];

/**
 * The days of the week, Monday first, e.g. a site's preferred day for visits.
 * @labels weekday
 */
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

/**
 * How urgently a site's work is handled, besides each order's own priority.
 * @labels sitePriority
 */
export const sitePriorities = ["normal", "high"] as const;
export type SitePriority = (typeof sitePriorities)[number];
