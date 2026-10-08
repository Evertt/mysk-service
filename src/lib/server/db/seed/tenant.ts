import type { Faker } from "@faker-js/faker";

import { generateCallOuts, generateContractTerms, splitContractTerms } from "./contracts.ts";
import { generateCustomers } from "./customers.ts";
import { generateEngineers } from "./engineers.ts";
import { generateEquipment, updateEquipmentStatus } from "./equipment.ts";
import { generateMaterials } from "./materials.ts";
import { generateOrders } from "./orders.ts";

export interface TenantSize {
	customers: number;
	engineers: number;
	orders: number;
	/** Whether the tenant has the service contracts module, and so contracts. */
	contracts: boolean;
}

/**
 * Generates one tenant's data, with ids from 1 (they're shifted when inserted). Orders only
 * reference equipment owned by the same customer, get an engineer whose specialty fits the
 * equipment, have a status that matches their dates, and come after the customer joined and the
 * unit was installed. The order matters: it's the order the faker is used in, so changing it
 * changes the demo data.
 */
export function generateTenant(faker: Faker, size: TenantSize) {
	const customers = generateCustomers(faker, size.customers);
	const engineers = generateEngineers(faker, size.engineers);
	const equipments = generateEquipment(faker, customers);
	const materials = generateMaterials(faker);
	const { orders, orderLines } = generateOrders(faker, size.orders, {
		customers,
		equipments,
		engineers,
		materials,
	});
	updateEquipmentStatus(faker, equipments, orders);

	// Only for tenants with the contracts module.
	const contractTerms = size.contracts ? generateContractTerms(faker, customers, equipments) : [];
	const { contracts, contractCoverage } = splitContractTerms(contractTerms);
	const callOuts = generateCallOuts(contractTerms, orders.length, equipments, materials);

	return {
		customers,
		engineers,
		equipments,
		materials,
		orders: [...orders, ...callOuts.orders],
		orderLines: [...orderLines, ...callOuts.orderLines],
		contracts,
		contractCoverage,
	};
}

/** One tenant's generated data, see `generateTenant`. */
export type TenantData = ReturnType<typeof generateTenant>;
