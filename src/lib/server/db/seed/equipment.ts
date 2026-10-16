import type { Faker } from "@faker-js/faker";

import {
	type EquipmentStatus,
	isCorrectiveWork,
	type OrderPriority,
	type OrderStatus,
	type OrderType,
} from "#lib/models.ts";

import { type FieldworksCategory, seedCategoryKeys } from "./categories.ts";
import { addDays, now } from "./clock.ts";

// Brands common in Dutch installations.
const manufacturers: Record<FieldworksCategory, string[]> = {
	generator: ["Bredenoord", "Kohler SDMO", "Cummins"],
	chiller: ["Daikin", "Carrier", "Trane"],
	boiler: ["Remeha", "Intergas", "Nefit Bosch", "Vaillant"],
	compressor: ["Atlas Copco", "Kaeser", "Ingersoll Rand"],
	pump: ["Grundfos", "Wilo", "KSB"],
	elevator: ["Kone", "Otis", "Schindler"],
	air_handler: ["Systemair", "Swegon", "Hoval"],
};

/**
 * One to five units for each customer, installed after the customer joined; ids from 1. Each has
 * one of the demo categories, by its key (see `seedCategories`).
 */
export function generateEquipment(faker: Faker, customers: { id: number; createdAt: Date }[]) {
	return customers
		.flatMap((owner) =>
			Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => {
				const category = faker.helpers.arrayElement(seedCategoryKeys);
				const installedAt = faker.date.between({ from: owner.createdAt, to: addDays(now, -60) });
				return {
					serialNumber: faker.string.alphanumeric({ length: 10, casing: "upper" }),
					model: `${faker.string.alpha({ length: 2, casing: "upper" })}-${faker.number.int({ min: 100, max: 990 })}`,
					manufacturer: faker.helpers.arrayElement(manufacturers[category]),
					category,
					status: "operational" as EquipmentStatus,
					customerId: owner.id,
					installedAt,
					warrantyUntil: addDays(installedAt, faker.helpers.arrayElement([2, 3, 5]) * 365),
				};
			}),
		)
		.map((item, i) => ({ id: i + 1, ...item }));
}

/**
 * Sets the units' status from the orders, in place: equipment with an open breakdown or repair is
 * out of service (urgent) or needs service, and a few of the others are decommissioned.
 */
export function updateEquipmentStatus(
	faker: Faker,
	equipments: { id: number; status: EquipmentStatus }[],
	orders: {
		type: OrderType;
		status: OrderStatus;
		priority: OrderPriority;
		equipmentIds: readonly number[];
	}[],
) {
	for (const o of orders) {
		if (!isCorrectiveWork(o.type)) continue;
		if (!["quote", "scheduled", "in_progress"].includes(o.status)) continue;
		for (const unit of o.equipmentIds) {
			const item = equipments[unit - 1];
			if (o.priority === "urgent") item.status = "out_of_service";
			else if (item.status === "operational") item.status = "needs_service";
		}
	}
	for (const item of equipments) {
		if (item.status === "operational" && faker.datatype.boolean(0.04))
			item.status = "decommissioned";
	}
}
