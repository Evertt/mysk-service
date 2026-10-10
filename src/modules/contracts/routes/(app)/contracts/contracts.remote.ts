import { error, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import * as v from "valibot";

import { nextDay } from "#lib/dates.ts";
import { formatDate } from "#lib/i18n/index.ts";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import {
	currentTenant,
	idInTenant,
	idsInTenant,
	inTenant,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, equipment, order } from "#lib/server/db/schema.ts";
import { refuse, type Problem } from "#lib/server/forms.ts";
import { bulkChange, idsTarget } from "#lib/server/lists/index.ts";
import { nextNumber } from "#lib/server/numbering.ts";

import { command, form, query } from "../../../remote-functions.ts";
import { contractNumbers, overlappingCoverage } from "../../../server/contracts.ts";
import { contract, contractEquipment } from "../../../server/schema.ts";
import { contractFields } from "./contract-schema.ts";

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

/** One contract with its customer and covered equipment, plus the work on that equipment during the contract. */
export const getContract = query(v.string(), async (number) => {
	const found = await db.query.contract.findFirst({
		where: and(eq(contract.number, number), inTenant(contract)),
		with: { customer: true, coverage: { with: { equipment: true } } },
	});
	if (!found) error(404, m.contracts_not_found_number({ number }));

	const { coverage, ...rest } = found;
	const units = coverage
		.map((row) => row.equipment)
		.sort(
			(a, b) =>
				a.manufacturer.localeCompare(b.manufacturer) ||
				a.model.localeCompare(b.model) ||
				a.serialNumber.localeCompare(b.serialNumber),
		);

	const orders = units.length
		? await db.query.order.findMany({
				columns: {
					id: true,
					number: true,
					equipmentId: true,
					type: true,
					status: true,
					description: true,
					createdAt: true,
				},
				where: and(
					inTenant(order),
					inArray(
						order.equipmentId,
						units.map((unit) => unit.id),
					),
					gte(order.createdAt, found.startsOn),
					lt(order.createdAt, nextDay(found.endsOn)),
				),
				orderBy: desc(order.createdAt),
			})
		: [];
	const serials = new Map(units.map((unit) => [unit.id, unit.serialNumber]));

	return {
		contract: { ...rest, equipment: units },
		orders: orders.map((o) => ({ ...o, serialNumber: serials.get(o.equipmentId!) ?? "" })),
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
				category: equipment.category,
				status: equipment.status,
			})
			.from(equipment)
			.where(inTenant(equipment))
			.orderBy(asc(equipment.manufacturer), asc(equipment.model)),
	]);
	return { customers, equipments };
});

type ContractInput = v.InferOutput<v.ObjectSchema<typeof contractFields, undefined>>;

type ContractField = "customerId" | "endsOn" | "equipmentIds";

/**
 * Checks what the schema can't: the customer exists in the tenant, the period runs forwards, the
 * units are the customer's own, and none of them is already covered by another of the tenant's
 * contracts in the same period.
 */
async function checkContract(
	id: number | null,
	input: ContractInput,
): Promise<Problem<ContractField>[]> {
	const problems: Problem<ContractField>[] = [];
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: idInTenant(customer, input.customerId),
	});
	if (!owner) {
		problems.push({ field: "customerId", message: m.contracts_unknown_customer() });
	}
	if (input.endsOn <= input.startsOn) {
		problems.push({ field: "endsOn", message: m.contracts_ends_before_start() });
	}

	const units = await db
		.select({ id: equipment.id, customerId: equipment.customerId })
		.from(equipment)
		.where(idsInTenant(equipment, input.equipmentIds));
	if (
		units.length !== new Set(input.equipmentIds).size ||
		units.some((unit) => unit.customerId !== input.customerId)
	) {
		problems.push({
			field: "equipmentIds",
			message: m.contracts_units_of_customer(),
		});
	} else {
		const covered = await overlappingCoverage(input.equipmentIds, input, id);
		for (const row of covered) {
			problems.push({
				field: "equipmentIds",
				message: m.contracts_unit_already_covered({
					serial: row.serialNumber,
					number: row.number,
					date: formatDate(row.endsOn),
				}),
			});
		}
	}
	return problems;
}

/**
 * Creates or updates one of the tenant's contracts and replaces its coverage; returns the contract
 * number. A new contract gets the tenant's next number (see `nextNumber()`).
 */
async function saveContract(organizationId: string, id: number | null, input: ContractInput) {
	const { equipmentIds, ...fields } = input;

	return db.transaction(async (tx) => {
		const existing = id
			? await tx.query.contract.findFirst({
					where: idInTenant(contract, id),
					with: { coverage: { columns: { equipmentId: true } } },
				})
			: null;
		if (id && !existing) error(404, m.contracts_not_found());

		let contractId: number;
		let number: string;
		if (existing) {
			contractId = existing.id;
			number = existing.number;
			// The contract was checked to be the tenant's, so its coverage is too. Remove it before the
			// customer may change: coverage must be of the contract's customer.
			await tx.delete(contractEquipment).where(eq(contractEquipment.contractId, contractId));
			await tx.update(contract).set(fields).where(idInTenant(contract, contractId));
		} else {
			number = await nextNumber(tx, contractNumbers);
			const [inserted] = await tx
				.insert(contract)
				.values({ ...fields, organizationId, number })
				.returning({ id: contract.id });
			contractId = inserted.id;
		}

		await tx.insert(contractEquipment).values(
			[...new Set(equipmentIds)].map((equipmentId) => ({
				customerId: fields.customerId,
				contractId,
				equipmentId,
			})),
		);
		const covered = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);
		const before = existing && {
			...existing,
			equipmentIds: covered(existing.coverage.map((row) => row.equipmentId)),
		};
		const after = { ...fields, equipmentIds: covered(equipmentIds) };
		const subject = { type: "contract", id: contractId, label: number };
		await recordActivity(tx, { action: existing ? "updated" : "created", subject, before, after });
		return number;
	});
}

export const createContract = form(v.object(contractFields), async (input, issue) => {
	const { organizationId } = currentTenant();
	const problems = await checkContract(null, input);
	refuse(issue, problems);
	const number = await saveContract(organizationId, null, input);
	// Send fresh data along with the redirect (a single-flight mutation); otherwise the page we go
	// to first shows what it cached before.
	void getContracts().refresh();
	redirect(303, `/contracts/${number}`);
});

export const updateContract = form(
	v.object({ id: id(), ...contractFields }),
	async (data, issue) => {
		const { organizationId } = currentTenant();
		const { id, ...input } = data;
		const problems = await checkContract(id, input);
		refuse(issue, problems);
		const number = await saveContract(organizationId, id, input);
		void getContracts().refresh();
		void getContract(number).refresh();
		redirect(303, `/contracts/${number}`);
	},
);

/**
 * Deletes one of the tenant's contracts, with its coverage; a 404 if there's no such contract. The
 * contract's page and the list's bulk delete share it.
 */
async function removeContract(id: number) {
	// Nothing references a contract; its coverage goes with it.
	await db.transaction(async (tx) => {
		const found = await tx.query.contract.findFirst({
			columns: { id: true, number: true },
			where: idInTenant(contract, id),
		});
		if (!found) error(404, m.contracts_not_found());
		await tx.delete(contractEquipment).where(eq(contractEquipment.contractId, id));
		await tx.delete(contract).where(idInTenant(contract, id));
		const subject = { type: "contract", id, label: found.number };
		await recordActivity(tx, { action: "deleted", subject });
	});
}

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
