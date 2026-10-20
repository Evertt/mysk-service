import { redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { listedUnitsOf, onAnyUnit } from "#lib/orders/server/index.ts";
import { id } from "#lib/schema.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, equipment, equipmentCategory, order } from "#lib/server/db/schema.ts";
import { bulkChange, idsTarget, inDays } from "#lib/server/lists/index.ts";
import { orNotFound } from "#lib/server/records.ts";

import { contractFields } from "./form/contract-schema.ts";
import { command, form, query } from "./remote-functions.ts";
import { coverageOf } from "./server/contracts.ts";
import { removeContract, saveContract } from "./server/saving.ts";
import { contract, contractEquipment } from "./server/schema.ts";

/** The tenant's contracts with their customer and the number of units they cover, latest start first. */
export const getContracts = query(async () => {
	const coverage = db
		.select({ contractId: contractEquipment.contractId, units: count().as("units") })
		.from(contractEquipment)
		.innerJoin(...tenantJoin(contract, contractEquipment.contractId))
		.groupBy(contractEquipment.contractId)
		.as("coverage");

	return db
		.select({
			id: contract.id,
			number: contract.number,
			level: contract.level,
			startsOn: contract.startsOn,
			endsOn: contract.endsOn,
			monthlyFee: contract.monthlyFee,
			responseHours: contract.responseHours,
			createdAt: contract.createdAt,
			customer: { id: customer.id, code: customer.code, name: customer.name },
			units: sql<number>`coalesce(${coverage.units}, 0)`,
		})
		.from(contract)
		.innerJoin(...tenantJoin(customer, contract.customerId))
		.leftJoin(coverage, eq(coverage.contractId, contract.id))
		.where(inTenant(contract))
		.orderBy(desc(contract.startsOn));
});

/** One contract with its customer and covered equipment, plus the orders it covered. */
export const getContract = query(v.string(), async (number) => {
	const found = orNotFound(
		await db.query.contract.findFirst({
			where: and(eq(contract.number, number), inTenant(contract)),
			with: {
				customer: true,
				coverage: {
					with: { equipment: { with: { category: { columns: { name: true } } } } },
				},
			},
		}),
		m.contracts_not_found_number({ number }),
	);

	const { coverage, ...rest } = found;
	const units = coverage
		.map((row) => row.equipment)
		.sort(
			(a, b) =>
				a.manufacturer.localeCompare(b.manufacturer) ||
				a.model.localeCompare(b.model) ||
				a.serialNumber.localeCompare(b.serialNumber),
		);

	// The orders made during the contract on any of its units, as candidates.
	const made = units.length
		? await db
				.select({
					id: order.id,
					number: order.number,
					type: order.type,
					status: order.status,
					description: order.description,
					createdAt: order.createdAt,
				})
				.from(order)
				.where(
					and(
						inTenant(order),
						onAnyUnit(units.map((unit) => unit.id)),
						// Made during the contract, on its days in the user's time zone.
						inDays(order.createdAt, [
							{ from: found.startsOn.toString(), to: found.endsOn.toString() },
						]),
					),
				)
				.orderBy(desc(order.createdAt))
		: [];
	const listed = await listedUnitsOf(made.map((row) => row.id));
	// Of those, the ones it covers, as their prices and response times have it (`coverageOf()`):
	// covered work on units it all covers. Not an order on other units too (mixed coverage), nor an
	// installation on a covered unit.
	const covering = await coverageOf(
		made.map((row) => ({ ...row, equipmentIds: (listed.get(row.id) ?? []).map(({ id }) => id) })),
	);

	return {
		contract: { ...rest, equipment: units },
		// With their first unit and how many they're about, for `unitsSummary()`.
		orders: made.flatMap((row) => {
			if (covering.get(row.id)?.id !== found.id) return [];
			const own = listed.get(row.id) ?? [];
			return [{ ...row, unit: own[0] ?? null, unitCount: own.length }];
		}),
	};
});

/** Everything the contract form needs to choose from. */
export const getContractFormOptions = query(async () => {
	const [customers, equipments] = await Promise.all([
		db
			.select({ id: customer.id, code: customer.code, name: customer.name })
			.from(customer)
			.where(inTenant(customer))
			.orderBy(asc(customer.name)),
		db
			.select({
				id: equipment.id,
				customerId: equipment.customerId,
				model: equipment.model,
				manufacturer: equipment.manufacturer,
				serialNumber: equipment.serialNumber,
				category: equipmentCategory.name,
				status: equipment.status,
			})
			.from(equipment)
			.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
			.where(inTenant(equipment))
			.orderBy(asc(equipment.manufacturer), asc(equipment.model)),
	]);
	return { customers, equipments };
});

export const createContract = form(v.object(contractFields), async (input) => {
	const number = await saveContract(null, input);
	// Send fresh data along with the redirect (a single-flight mutation); otherwise the page we go
	// to first shows what it cached before.
	void getContracts().refresh();
	redirect(303, `/contracts/${number}`);
});

export const updateContract = form(v.object({ id: id(), ...contractFields }), async (data) => {
	const { id, ...input } = data;
	const number = await saveContract(id, input);
	void getContracts().refresh();
	void getContract(number).refresh();
	redirect(303, `/contracts/${number}`);
});

export const deleteContract = form(v.object({ id: id() }), async ({ id }) => {
	await removeContract(id);
	void getContracts().refresh();
	redirect(303, "/contracts");
});

/** Deletes the selected contracts, with their coverage. */
export const bulkDeleteContracts = command(idsTarget, async (target) => {
	const result = await bulkChange(target, {
		table: contract,
		label: contract.number,
		change: (each) => removeContract(each.id),
	});
	void getContracts().refresh();
	return result;
});
