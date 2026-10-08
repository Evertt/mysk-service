/**
 * Domain enums shared by the database schema, the seed script and the UI. Kept out of
 * `$lib/server` so client code (filters, badges) can import the option lists.
 */

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

export const materialUnits = ["pcs", "m", "kg", "l"] as const;
export type MaterialUnit = (typeof materialUnits)[number];

/** The smallest amount of a unit: whole pieces; metres, kilos and litres to two decimals. */
export const quantityStep = (unit: MaterialUnit) => (unit === "pcs" ? 1 : 0.01);

/** Whether `quantity` is a multiple of the unit's step, e.g. no half pieces. */
export const fitsUnit = (quantity: number, unit: MaterialUnit) => {
	const steps = quantity / quantityStep(unit);
	return Math.abs(steps - Math.round(steps)) < 1e-9;
};

/** The amount of an order line in cents: quantity × unit price, rounded to the cent. */
export const lineTotal = (quantity: number, unitPrice: number) => Math.round(quantity * unitPrice);

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

/**
 * Orders whose material lines hold stock: from scheduled on. A quote's lines are only a proposal,
 * and a cancelled order gives its materials back.
 */
export const stockHoldingStatuses = [
	"scheduled",
	"in_progress",
	"completed",
	"invoiced",
] as const satisfies OrderStatus[];

export const holdsStock = (status: OrderStatus) =>
	(stockHoldingStatuses as readonly OrderStatus[]).includes(status);

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

// --- Service contracts (optional module, see `#lib/modules.ts`) --------------------------------

export const contractLevels = ["basic", "standard", "premium"] as const;
export type ContractLevel = (typeof contractLevels)[number];

/** The response time (in hours) a contract level promises by default. */
export const defaultResponseHours: Record<ContractLevel, number> = {
	basic: 72,
	standard: 24,
	premium: 4,
};

/** Not stored: derived from the contract's period, see `contractStatus`. */
export const contractStatuses = ["upcoming", "active", "expired"] as const;
export type ContractStatus = (typeof contractStatuses)[number];

/** Where `now` falls in a contract's period; both dates are inclusive days. */
export function contractStatus(
	contract: { startsOn: Date; endsOn: Date },
	now = new Date(),
): ContractStatus {
	if (now < contract.startsOn) return "upcoming";
	const afterEnd = new Date(contract.endsOn);
	afterEnd.setDate(afterEnd.getDate() + 1);
	return now < afterEnd ? "active" : "expired";
}

// --- Stock movements ---------------------------------------------------------------------------

/**
 * Why a material's stock changed: its opening balance, a delivery, a count that found a different
 * amount, or an order line taking it (consumption) or giving it back (return).
 */
export const stockMovementKinds = [
	"opening_balance",
	"receipt",
	"adjustment",
	"consumption",
	"return",
] as const;
export type StockMovementKind = (typeof stockMovementKinds)[number];

// --- Invoicing (optional module, see `#lib/modules.ts`) ----------------------------------------

/**
 * Where an invoice is: a draft (still editable), sent to the customer, paid, or void (cancelled;
 * it keeps its number, so the numbers have no gaps). Overdue isn't stored: it's a sent invoice
 * past its due date, see `invoiceState` in `#lib/components/invoicing/invoice.ts`.
 */
export const invoiceStatuses = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

// --- Activity log ------------------------------------------------------------------------------

/**
 * What someone did to a record in the activity log (`activity`): created, updated or deleted it,
 * or a domain verb that says more, e.g. scheduled an order or received stock for a material. A new
 * verb also gets a phrase in `actionVerbs` in `#lib/activity.ts`.
 */
export const activityActions = [
	"created",
	"updated",
	"deleted",
	"scheduled",
	"stock_received",
	"stock_adjusted",
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
	// Invoicing.
	"issued",
	"paid",
	"voided",
	// Saved views shared with the organization.
	"shared",
	"unshared",
] as const;
export type ActivityAction = (typeof activityActions)[number];
