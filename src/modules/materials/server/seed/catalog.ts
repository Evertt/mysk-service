/** The materials module's demo data: its catalog, and the lines orders use it in. */
import type { Faker } from "@faker-js/faker";

import type { MaterialUnit, OrderType } from "#lib/models.ts";
import { formatCode } from "#lib/numbering.ts";
import { DAY, now } from "#lib/server/db/seed/clock.ts";
import type { SeedOrder } from "#lib/server/db/seed/module-seed.ts";

/** The materials in stock, in Dutch, with the range of their price in euros. */
const catalog: [name: string, unit: MaterialUnit, minPrice: number, maxPrice: number][] = [
	["Koperbuis 15 mm", "m", 6, 12],
	["Koperbuis 22 mm", "m", 9, 18],
	["Buisisolatie 22 mm", "m", 2, 5],
	["Kogelkraan DN25", "pcs", 18, 45],
	["Terugslagklep DN40", "pcs", 40, 95],
	["Manometer 0–10 bar", "pcs", 15, 35],
	["Expansievat 25 l", "pcs", 60, 140],
	["Motorblok circulatiepomp", "pcs", 180, 420],
	["Mechanische asafdichting", "pcs", 70, 160],
	["Groefkogellager 6204", "pcs", 8, 22],
	["Groefkogellager 6308", "pcs", 25, 60],
	["V-snaar SPZ 1250", "pcs", 12, 28],
	["Koppelingsrubber", "pcs", 15, 40],
	["Hydraulische olie ISO 46", "l", 4, 9],
	["Compressorolie", "l", 9, 22],
	["Vetpatroon", "pcs", 6, 14],
	["Koudemiddel R32", "kg", 25, 60],
	["Koudemiddel R410A", "kg", 30, 75],
	["Filterdroger", "pcs", 20, 55],
	["Paneelfilter G4 592×592", "pcs", 8, 18],
	["Zakkenfilter F7 592×592", "pcs", 25, 55],
	["Magneetschakelaar 3P 40 A", "pcs", 35, 90],
	["Thermisch overstroomrelais", "pcs", 30, 70],
	["Installatieautomaat C16", "pcs", 9, 25],
	["Voedingskabel 5×2,5 mm²", "m", 3, 7],
	["Stuurstroomkabel 12×0,75 mm²", "m", 2, 6],
	["Temperatuurvoeler PT1000", "pcs", 25, 65],
	["Druktransmitter", "pcs", 120, 280],
	["PLC-I/O-module", "pcs", 220, 520],
	["Frequentieregelaar 7,5 kW", "pcs", 650, 1400],
	["Aandrijfriem liftdeur", "pcs", 45, 110],
	["Geleideschoen lift", "pcs", 30, 75],
	["Brandstoffilter", "pcs", 15, 40],
	["Startaccu 12 V 100 Ah", "pcs", 140, 260],
	["Koelvloeistof concentraat", "l", 5, 12],
	["Brandersproeier", "pcs", 12, 30],
	["Ontstekingselektrode", "pcs", 18, 45],
	["Pakkingset", "pcs", 20, 60],
	["Bevestigingsset rvs", "pcs", 10, 25],
	["Tiewraps (100 st.)", "pcs", 3, 8],
];

/** The catalog as one tenant has it, with prices and stock of its own; ids from 1. */
export function generateMaterials(faker: Faker) {
	return catalog.map(([name, unit, min, max], i) => ({
		id: i + 1,
		sku: formatCode("material", i + 1),
		name,
		unit,
		unitPrice: faker.number.int({ min: min * 100, max: max * 100, multipleOf: 5 }),
		stock:
			unit === "pcs"
				? faker.number.int({ min: 0, max: 250 })
				: faker.number.float({ min: 0, max: 900, fractionDigits: 1 }),
	}));
}

const linesRange: Record<OrderType, [number, number]> = {
	installation: [3, 8],
	maintenance: [1, 4],
	repair: [1, 4],
	inspection: [0, 1],
};

/** The tenant's orders' material lines, a few per order, by its type; ids from 1. */
export function generateOrderLines(
	faker: Faker,
	orders: SeedOrder[],
	materials: ReturnType<typeof generateMaterials>,
) {
	return orders.flatMap((o) => {
		const [min, max] = linesRange[o.type];
		const picked = faker.helpers.arrayElements(materials, faker.number.int({ min, max }));
		// Older orders were priced a little lower than today's list price.
		const ageInYears = (now.getTime() - o.createdAt.getTime()) / (365 * DAY);
		return picked.map((m) => ({
			orderId: o.id,
			materialId: m.id,
			quantity:
				m.unit === "pcs"
					? faker.number.int({ min: 1, max: 6 })
					: faker.number.float({ min: 0.5, max: 25, fractionDigits: 2 }),
			unitPrice: Math.round(m.unitPrice * (1 - 0.04 * ageInYears)),
		}));
	});
}
