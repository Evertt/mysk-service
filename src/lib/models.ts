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
