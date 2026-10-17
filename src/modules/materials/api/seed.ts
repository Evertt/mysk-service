/**
 * What the materials module makes for a tenant at seed time, in the draft's `modules.materials`:
 * for a module that adds orders to the draft and gives them material lines too (contracts'
 * call-outs), or sets stock aside for orders of its own (the parts shop). Only types: a module that
 * enhances materials may import them.
 */

/** A seeded material; ids from 1, the tenant's own. */
interface SeedMaterial {
	id: number;
	sku: string;
	name: string;
	unit: "pcs" | "m" | "kg" | "l";
	/** In cents. */
	unitPrice: number;
	stock: number;
}

/** A seeded order line, by the draft's order and material ids. */
interface SeedOrderLine {
	orderId: number;
	materialId: number;
	quantity: number;
	/** In cents. */
	unitPrice: number;
}

/**
 * A movement of stock another module's demo data made (the parts shop's reservations for its
 * orders), by the draft's material id. Its quantity is already part of the material's `stock`: the
 * opening balance makes up for it.
 */
interface SeedMovement {
	materialId: number;
	/** Negative takes. */
	quantity: number;
	kind: "reservation" | "release";
	note: string;
	createdAt: Date;
}

/** The tenant's materials and their orders' lines, as the draft holds them. */
export interface MaterialsDraft {
	materials: SeedMaterial[];
	orderLines: SeedOrderLine[];
	/** Movements the modules that require materials add (see `SeedMovement`). */
	movements: SeedMovement[];
}
