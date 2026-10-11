/**
 * What the materials module makes for a tenant at seed time, in the draft's `modules.materials`:
 * for a module that adds orders to the draft and gives them material lines too (contracts'
 * call-outs). Only types: a module that enhances materials may import them.
 */

/** A seeded material; ids from 1, the tenant's own. */
export interface SeedMaterial {
	id: number;
	sku: string;
	name: string;
	unit: "pcs" | "m" | "kg" | "l";
	/** In cents. */
	unitPrice: number;
	stock: number;
}

/** A seeded order line, by the draft's order and material ids. */
export interface SeedOrderLine {
	orderId: number;
	materialId: number;
	quantity: number;
	/** In cents. */
	unitPrice: number;
}

/** The tenant's materials and their orders' lines, as the draft holds them. */
export interface MaterialsDraft {
	materials: SeedMaterial[];
	orderLines: SeedOrderLine[];
}
