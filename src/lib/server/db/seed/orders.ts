import type { Faker } from "@faker-js/faker";

import {
	type EquipmentCategory,
	type OrderPriority,
	type OrderStatus,
	type OrderType,
	specialtyForCategory,
} from "#lib/models.ts";
import { formatCode } from "#lib/numbering.ts";

import { addDays, DAY, now } from "./clock.ts";
import type { generateCustomers } from "./customers.ts";
import type { generateEngineers } from "./engineers.ts";
import type { generateEquipment } from "./equipment.ts";

const repairs: Record<EquipmentCategory, string[]> = {
	generator: [
		"Aggregaat start niet bij proefdraaien",
		"Aggregaat neemt niet over bij stroomuitval",
		"Olielekkage aan de motor",
	],
	chiller: [
		"Koelmachine valt uit op hoge druk",
		"Te weinig koelvermogen bij warm weer",
		"Vermoedelijk lek in het koudemiddelcircuit",
	],
	boiler: [
		"Storing cv-ketel, geen warm water",
		"Ketel gaat in storing, ontsteking faalt",
		"Waterdruk loopt steeds terug",
	],
	compressor: [
		"Compressor slaat af op temperatuur",
		"Luchtlek, druk loopt terug",
		"Veel condensaat in de perslucht",
	],
	pump: [
		"Pomp maakt herrie en trilt",
		"Lekkage bij de asafdichting",
		"Pomp draait maar bouwt geen druk op",
	],
	elevator: [
		"Lift staat stil tussen twee verdiepingen",
		"Liftdeur sluit niet goed",
		"Lift stopt niet gelijk met de vloer",
	],
	air_handler: [
		"Luchtbehandelingskast in storing",
		"Ventilator maakt afwijkend geluid",
		"Te weinig luchtopbrengst",
	],
};

const describe: Record<OrderType, (faker: Faker, category?: EquipmentCategory) => string> = {
	installation: (faker) =>
		`Nieuwe installatie plaatsen en in bedrijf stellen${faker.helpers.maybe(() => ", incl. regeling aansluiten") ?? ""}`,
	maintenance: (faker) =>
		faker.helpers.arrayElement([
			"Periodiek preventief onderhoud",
			"Jaarlijkse onderhoudsbeurt en veiligheidscontrole",
			"Filters en slijtdelen vervangen",
			"Smeren en V-snaren spannen",
		]),
	repair: (faker, category) =>
		faker.helpers.arrayElement(
			category
				? repairs[category]
				: ["Storing, installatie buiten bedrijf", "Storingscode op de regeling"],
		),
	inspection: (faker) =>
		faker.helpers.arrayElement([
			"Wettelijke periodieke keuring",
			"Keuring voor de verzekeraar",
			"Inspectie voor het einde van de garantie",
		]),
};

const laborRange: Record<OrderType, [number, number]> = {
	installation: [8, 40],
	maintenance: [2, 6],
	repair: [1, 12],
	inspection: [1, 3],
};

type Engineer = ReturnType<typeof generateEngineers>[number];

/** Derives a status (and matching dates) from when the order was created. */
function lifecycle(
	faker: Faker,
	createdAt: Date,
): {
	status: OrderStatus;
	scheduledFor: Date | null;
	completedAt: Date | null;
} {
	const scheduledFor = addDays(createdAt, faker.number.int({ min: 1, max: 30 }));
	if (faker.datatype.boolean(0.05)) return { status: "cancelled", scheduledFor, completedAt: null };
	if (scheduledFor > now) {
		return faker.datatype.boolean(0.35)
			? { status: "quote", scheduledFor: null, completedAt: null }
			: { status: "scheduled", scheduledFor, completedAt: null };
	}
	if (now.getTime() - scheduledFor.getTime() < 3 * DAY) {
		return { status: "in_progress", scheduledFor, completedAt: null };
	}
	const completedAt = addDays(scheduledFor, faker.number.float({ min: 0.1, max: 3 }));
	const invoiced = now.getTime() - completedAt.getTime() > 14 * DAY && faker.datatype.boolean(0.85);
	return { status: invoiced ? "invoiced" : "completed", scheduledFor, completedAt };
}

/**
 * One tenant's orders (oldest first, ids from 1). An order only references equipment of its
 * customer, and gets an engineer whose specialty fits the equipment.
 */
export function generateOrders(
	faker: Faker,
	count: number,
	{
		customers,
		equipments,
		engineers,
	}: {
		customers: ReturnType<typeof generateCustomers>;
		equipments: ReturnType<typeof generateEquipment>;
		engineers: Engineer[];
	},
) {
	const engineersBySpecialty = Object.groupBy(engineers, (e) => e.specialty);

	/** The engineer for a job: one whose specialty fits the unit, preferably one still working. */
	function pickEngineer(category: EquipmentCategory | undefined, active: boolean) {
		const pool = (category && engineersBySpecialty[specialtyForCategory[category]]) || engineers;
		const candidates = active ? pool.filter((e) => e.active) : pool;
		return faker.helpers.arrayElement(candidates.length ? candidates : engineers);
	}

	const orders = Array.from({ length: count }, () => {
		const owner = faker.helpers.arrayElement(customers);
		const owned = equipments.filter((e) => e.customerId === owner.id);
		const type = faker.helpers.weightedArrayElement<OrderType>([
			{ value: "maintenance", weight: 5 },
			{ value: "repair", weight: 4 },
			{ value: "inspection", weight: 2 },
			{ value: "installation", weight: 1 },
		]);
		const target =
			type === "installation" && faker.datatype.boolean(0.3)
				? undefined
				: faker.helpers.arrayElement(owned);
		// Weighted towards recent weeks so there's a healthy amount of open work. Not before the
		// customer joined, nor before the unit was installed (which is at least 60 days ago), so its
		// service history starts with its installation; the dates that follow come after it.
		const window = addDays(now, faker.datatype.boolean(0.25) ? -40 : -540);
		const createdAt = faker.date.between({
			from: Math.max(
				window.getTime(),
				owner.createdAt.getTime(),
				target?.installedAt.getTime() ?? 0,
			),
			to: now,
		});
		const { status, scheduledFor, completedAt } = lifecycle(faker, createdAt);
		const priority: OrderPriority =
			type === "repair"
				? faker.helpers.arrayElement(["normal", "high", "high", "urgent"])
				: faker.helpers.arrayElement(["low", "normal", "normal", "normal", "high"]);
		const [minHours, maxHours] = laborRange[type];
		return {
			customerId: owner.id,
			equipmentId: target?.id ?? null,
			engineerId:
				status === "quote"
					? null
					: pickEngineer(target?.category, scheduledFor! > addDays(now, -90)).id,
			type,
			status,
			priority,
			description: describe[type](faker, target?.category),
			scheduledFor,
			completedAt,
			laborHours: faker.number.float({ min: minHours, max: maxHours, multipleOf: 0.25 }),
			createdAt,
		};
	})
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
		.map((o, i) => ({
			id: i + 1,
			number: formatCode("order", i + 1, o.createdAt.getFullYear()),
			...o,
		}));

	return orders;
}
