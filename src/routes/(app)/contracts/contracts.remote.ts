import { form, query } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { formatDate } from "#lib/format.js";
import { id } from "#lib/schema.js";
import { db } from "#lib/server/db/index.js";
import { contract, contractEquipment, customer, equipment, order } from "#lib/server/db/schema.js";
import { requireUser } from "#lib/server/session.js";

import { contractFields } from "./contract-schema.js";

/** The day after `date`; contracts run up to and including their last day. */
const nextDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

/** All contracts with their customer and the number of units they cover, latest start first. */
export const getContracts = query(async () => {
	requireUser();
	const coverage = db
		.select({ contractId: contractEquipment.contractId, units: count().as("units") })
		.from(contractEquipment)
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
		.innerJoin(customer, eq(contract.customerId, customer.id))
		.leftJoin(coverage, eq(coverage.contractId, contract.id))
		.orderBy(desc(contract.startsOn));
});

/** One contract with its customer and covered equipment, plus the work on that equipment during the contract. */
export const getContract = query(v.string(), async (number) => {
	requireUser();
	const found = await db.query.contract.findFirst({
		where: eq(contract.number, number),
		with: { customer: true, coverage: { with: { equipment: true } } },
	});
	if (!found) error(404, `Contract ${number} not found`);

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
	requireUser();
	const [customers, equipments] = await Promise.all([
		db
			.select({ id: customer.id, code: customer.code, name: customer.name })
			.from(customer)
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
			.orderBy(asc(equipment.manufacturer), asc(equipment.model)),
	]);
	return { customers, equipments };
});

type ContractInput = v.InferOutput<v.ObjectSchema<typeof contractFields, undefined>>;

type Problem = { field: "customerId" | "endsOn" | "equipmentIds"; message: string };

/**
 * Checks what the schema can't: the customer exists, the period runs forwards, the units are the
 * customer's own, and none of them is already covered by another contract in the same period.
 */
async function checkContract(id: number | null, input: ContractInput): Promise<Problem[]> {
	const problems: Problem[] = [];
	if (!(await db.query.customer.findFirst({ where: eq(customer.id, input.customerId) }))) {
		problems.push({ field: "customerId", message: "Unknown customer" });
	}
	if (input.endsOn <= input.startsOn) {
		problems.push({ field: "endsOn", message: "Must be after the start date" });
	}

	const units = await db
		.select({ id: equipment.id, customerId: equipment.customerId })
		.from(equipment)
		.where(inArray(equipment.id, input.equipmentIds));
	if (
		units.length !== new Set(input.equipmentIds).size ||
		units.some((unit) => unit.customerId !== input.customerId)
	) {
		problems.push({
			field: "equipmentIds",
			message: "A contract can only cover equipment of its own customer",
		});
	} else {
		const covered = await db
			.select({
				serialNumber: equipment.serialNumber,
				number: contract.number,
				endsOn: contract.endsOn,
			})
			.from(contractEquipment)
			.innerJoin(contract, eq(contractEquipment.contractId, contract.id))
			.innerJoin(equipment, eq(contractEquipment.equipmentId, equipment.id))
			.where(
				and(
					inArray(contractEquipment.equipmentId, input.equipmentIds),
					id ? ne(contract.id, id) : undefined,
					lte(contract.startsOn, input.endsOn),
					gte(contract.endsOn, input.startsOn),
				),
			)
			.orderBy(asc(equipment.serialNumber));
		for (const row of covered) {
			problems.push({
				field: "equipmentIds",
				message: `${row.serialNumber} is already covered by ${row.number} until ${formatDate(row.endsOn)}`,
			});
		}
	}
	return problems;
}

/** Creates or updates a contract and replaces its coverage; returns the contract number. */
async function saveContract(id: number | null, input: ContractInput) {
	const { equipmentIds, ...fields } = input;

	return db.transaction(async (tx) => {
		const existing = id ? await tx.query.contract.findFirst({ where: eq(contract.id, id) }) : null;
		if (id && !existing) error(404, "Contract not found");

		let contractId: number;
		let number: string;
		if (existing) {
			contractId = existing.id;
			number = existing.number;
			await tx.update(contract).set(fields).where(eq(contract.id, contractId));
			await tx.delete(contractEquipment).where(eq(contractEquipment.contractId, contractId));
		} else {
			// The number is derived from the id, which we only know after inserting.
			const [inserted] = await tx
				.insert(contract)
				.values({ ...fields, number: `pending-${crypto.randomUUID()}` })
				.returning({ id: contract.id });
			contractId = inserted.id;
			number = `CTR-${new Date().getFullYear()}-${String(contractId).padStart(4, "0")}`;
			await tx.update(contract).set({ number }).where(eq(contract.id, contractId));
		}

		await tx
			.insert(contractEquipment)
			.values([...new Set(equipmentIds)].map((equipmentId) => ({ contractId, equipmentId })));
		return number;
	});
}

export const createContract = form(v.object(contractFields), async (input, issue) => {
	requireUser();
	const problems = await checkContract(null, input);
	if (problems.length) invalid(...problems.map((p) => issue[p.field](p.message)));
	const number = await saveContract(null, input);
	// Send fresh data along with the redirect (a single-flight mutation); otherwise the page we go
	// to first shows what it cached before.
	void getContracts().refresh();
	redirect(303, `/contracts/${number}`);
});

export const updateContract = form(
	v.object({ id: id(), ...contractFields }),
	async (data, issue) => {
		requireUser();
		const { id, ...input } = data;
		const problems = await checkContract(id, input);
		if (problems.length) invalid(...problems.map((p) => issue[p.field](p.message)));
		const number = await saveContract(id, input);
		void getContracts().refresh();
		void getContract(number).refresh();
		redirect(303, `/contracts/${number}`);
	},
);

export const deleteContract = form(v.object({ id: id() }), async ({ id }) => {
	requireUser();
	// Nothing references a contract; its coverage goes with it.
	await db.transaction(async (tx) => {
		await tx.delete(contractEquipment).where(eq(contractEquipment.contractId, id));
		await tx.delete(contract).where(eq(contract.id, id));
	});
	void getContracts().refresh();
	redirect(303, "/contracts");
});
