/**
 * SHLTR's materials: the fourteen parts of its Onderdelen Shop (`docs/plans/shltr-domain.md`,
 * §2.8), for sectional doors and levellers, with its prices and its stock: three are low ("Laag
 * voorraad") and the two it orders on request ("Op aanvraag") are out. Its orders use them on the
 * units they fit, so a repair of a sectional door takes a spring set and a leveller's a cylinder.
 */
import type { Faker } from "@faker-js/faker";

import type { OrderType } from "#lib/models.ts";
import { DAY, now } from "#lib/server/db/seed/clock.ts";
import type { SeedOrder } from "#lib/server/db/seed/module-seed.ts";
import type { SeedEquipment } from "#lib/server/db/seed/tenant.ts";

import type { MaterialsDraft } from "../../api/seed.ts";

type Stock = "in_stock" | "low" | "on_request";

/** The shop's parts: SKU, name, price in euros, its stock, and the units it's for. */
const parts: [sku: string, name: string, price: number, stock: Stock][] = [
	["SD-001", "Veerpakket torsieveer", 145, "in_stock"],
	["SD-002", "Kabelset compleet", 89, "in_stock"],
	["SD-003", "Rolscharnieren set (10 st.)", 65, "in_stock"],
	["SD-004", "Bodemafdichting 3 m", 38, "in_stock"],
	["SD-005", "Openingsbeveiliging sensor", 120, "low"],
	["SD-006", "Scharnierband zij (paar)", 55, "in_stock"],
	["SD-007", "Isolatiepaneel compleet", 320, "on_request"],
	["SD-008", "Looplift aandrijving 24V", 385, "low"],
	["LV-001", "Hydraulische cilinder", 485, "in_stock"],
	["LV-002", "Lipscharnier compleet", 265, "in_stock"],
	["LV-003", "Hydrauliekslang set", 138, "in_stock"],
	["LV-004", "Noodstop schakelaar", 79, "in_stock"],
	["LV-005", "Veiligheidssteun service", 195, "low"],
	["LV-006", "Rubber zijbuffer", 118, "on_request"],
];

/** The catalog, ids from 1 (like `generateMaterials`): all by the piece (a set, a pair, one). */
export function generateShltrParts(faker: Faker): MaterialsDraft["materials"] {
	return parts.map(([sku, name, price, stock], i) => ({
		id: i + 1,
		sku,
		name,
		unit: "pcs",
		unitPrice: price * 100,
		stock:
			stock === "in_stock"
				? faker.number.int({ min: 12, max: 40 })
				: stock === "low"
					? faker.number.int({ min: 2, max: 6 })
					: 0,
	}));
}

/** The parts that fit a unit's category, by SKU prefix: the doors' and the levellers'. */
const fitting: Record<string, string[]> = {
	sectional_door: ["SD-001", "SD-002", "SD-003", "SD-004", "SD-005", "SD-006", "SD-008"],
	high_speed_door: ["SD-005"],
	dock_leveller: ["LV-001", "LV-002", "LV-003", "LV-004", "LV-005"],
	salvo_dock: ["LV-004"],
};
/** What damage takes besides: a panel for a door, buffers for a leveller. */
const forDamage: Record<string, string[]> = {
	sectional_door: ["SD-007", "SD-004", "SD-003"],
	dock_leveller: ["LV-006", "LV-002"],
};

const linesRange: Record<OrderType, [number, number]> = {
	breakdown: [0, 1],
	repair: [1, 2],
	maintenance: [0, 1],
	inspection: [0, 0],
	installation: [0, 1],
	survey: [0, 0],
	damage: [1, 2],
	project: [2, 4],
	other: [0, 0],
};

/** The parts SHLTR's orders used, on the units they fit (none for airco, stairs or fire doors). */
export function generateShltrPartLines(
	faker: Faker,
	orders: SeedOrder[],
	materials: MaterialsDraft["materials"],
	equipments: SeedEquipment[],
): MaterialsDraft["orderLines"] {
	const bySku = new Map(materials.map((m) => [m.sku, m]));
	return orders.flatMap((o) => {
		// The parts of its first unit, for an order about several of a kind.
		const [unit] = o.equipmentIds;
		const category = unit === undefined ? undefined : equipments[unit - 1].category;
		const pool = (category && (o.type === "damage" ? forDamage : fitting)[category]) || [];
		if (!pool.length) return [];
		const [min, max] = linesRange[o.type];
		const picked = faker.helpers.arrayElements(pool, faker.number.int({ min, max }));
		const ageInYears = (now.getTime() - o.createdAt.getTime()) / (365 * DAY);
		return picked.map((sku) => {
			const part = bySku.get(sku)!;
			return {
				orderId: o.id,
				materialId: part.id,
				quantity: sku === "SD-004" || sku === "LV-006" ? faker.number.int({ min: 1, max: 2 }) : 1,
				unitPrice: Math.round(part.unitPrice * (1 - 0.04 * ageInYears)),
			};
		});
	});
}
