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

export const equipmentCategories = [
	"generator",
	"chiller",
	"boiler",
	"compressor",
	"pump",
	"elevator",
	"air_handler",
] as const;
export type EquipmentCategory = (typeof equipmentCategories)[number];

export const equipmentStatuses = [
	"operational",
	"needs_service",
	"out_of_service",
	"decommissioned",
] as const;
export type EquipmentStatus = (typeof equipmentStatuses)[number];

export const orderTypes = ["installation", "maintenance", "repair", "inspection"] as const;
export type OrderType = (typeof orderTypes)[number];

export const orderStatuses = [
	"quote",
	"scheduled",
	"in_progress",
	"completed",
	"invoiced",
	"cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

/** Orders still to be done: quoted, scheduled or under way. */
export const openOrderStatuses = [
	"quote",
	"scheduled",
	"in_progress",
] as const satisfies OrderStatus[];

/** Orders whose work is done, and which count towards revenue. */
export const doneOrderStatuses = ["completed", "invoiced"] as const satisfies OrderStatus[];

export const isOpenOrder = (status: OrderStatus) =>
	(openOrderStatuses as readonly OrderStatus[]).includes(status);

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
 */
export const isEditableOrder = (status: OrderStatus) => status !== "invoiced";

export const orderPriorities = ["low", "normal", "high", "urgent"] as const;
export type OrderPriority = (typeof orderPriorities)[number];

/** Which engineer specialty services which equipment category. */
export const specialtyForCategory: Record<EquipmentCategory, EngineerSpecialty> = {
	generator: "electrical",
	chiller: "hvac",
	boiler: "plumbing",
	compressor: "mechanical",
	pump: "plumbing",
	elevator: "controls",
	air_handler: "hvac",
};

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
	// Saved views shared with the organization.
	"shared",
	"unshared",
] as const;
export type CoreActivityAction = (typeof activityActions)[number];
export type ActivityAction = CoreActivityAction | ModuleAction;
