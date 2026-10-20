/**
 * Saving and deleting the tenant's contracts, from the contract form and the list's bulk delete.
 */
import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type * as v from "valibot";

import { formatDate } from "#lib/i18n/index.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, idsInTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { insertRows } from "#lib/server/db/parameters.ts";
import { customer, equipment } from "#lib/server/db/schema.ts";
import { nextNumber } from "#lib/server/numbering.ts";
import { defineRemoval } from "#lib/server/records.ts";
import { type Problem, Refused } from "#lib/server/refused.ts";

import type { contractFields } from "../form/contract-schema.ts";
import { contractNumbers, overlappingCoverage } from "./contracts.ts";
import { contract, contractEquipment } from "./schema.ts";

type ContractInput = v.InferOutput<v.ObjectSchema<typeof contractFields, undefined>>;

/**
 * Checks what the schema can't: the customer exists in the tenant, the period runs forwards, the
 * units are the customer's own, and none of them is already covered by another of the tenant's
 * contracts in the same period.
 */
async function checkContract(id: number | null, input: ContractInput): Promise<Problem[]> {
	const problems: Problem[] = [];
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: idInTenant(customer, input.customerId),
	});
	if (!owner) {
		problems.push({ path: ["customerId"], message: m.contracts_unknown_customer() });
	}
	if (Temporal.PlainDate.compare(input.endsOn, input.startsOn) <= 0) {
		problems.push({ path: ["endsOn"], message: m.contracts_ends_before_start() });
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
			path: ["equipmentIds"],
			message: m.contracts_units_of_customer(),
		});
	} else {
		const covered = await overlappingCoverage(input.equipmentIds, input, id);
		for (const row of covered) {
			problems.push({
				path: ["equipmentIds"],
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
 * number. A new contract gets the tenant's next number (see `nextNumber()`). Refuses what
 * `checkContract()` finds, on the form's fields.
 */
export async function saveContract(id: number | null, input: ContractInput) {
	Refused.check(await checkContract(id, input));
	const { organizationId } = currentTenant();
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

		await insertRows(
			tx,
			contractEquipment,
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
		const subject: Subject = { type: "contract", id: contractId, label: number };
		await recordActivity(tx, { action: existing ? "updated" : "created", subject, before, after });
		return number;
	});
}

/**
 * Deletes one of the tenant's contracts, with its coverage; a 404 if there's no such contract. The
 * contract's page and the list's bulk delete share it. Nothing refers to a contract.
 */
export const removeContract = defineRemoval({
	table: contract,
	find: (tx, id) =>
		tx.query.contract.findFirst({
			columns: { id: true, number: true },
			where: idInTenant(contract, id),
		}),
	notFound: m.contracts_not_found,
	subject: (found): Subject => ({ type: "contract", id: found.id, label: found.number }),
	before: async (found, tx) => {
		await tx.delete(contractEquipment).where(eq(contractEquipment.contractId, found.id));
	},
});
