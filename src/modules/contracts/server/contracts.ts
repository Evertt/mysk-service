/**
 * Which contract covered an order, and which contracts overlap a period on the same units. The
 * rules themselves are in `../coverage.ts`; the contributions that make coverage count in core
 * are in `./index.ts`.
 */
import { and, asc, lte, gte, ne } from "drizzle-orm";

import type { OrderFacts } from "#lib/orders/extensions.ts";
import { tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";
import type { NumberTarget } from "#lib/server/numbering.ts";

import { coveringAllUnits, isCoveredWork } from "../coverage.ts";
import { contractNumberFormat } from "../model.ts";
import { contract, contractEquipment } from "./schema.ts";

/** Where contract numbers are kept, for `nextNumber()`. */
export const contractNumbers: NumberTarget = {
	format: contractNumberFormat,
	table: contract,
	column: contract.number,
};

/** The contract that covered an order. */
export type Coverage = Pick<
	typeof contract.$inferSelect,
	"id" | "number" | "level" | "responseHours" | "startsOn" | "endsOn"
>;

/**
 * For each covered order (by id), the contract that covered it: one that covered every one of its
 * units when it was made (see `coverage.ts`).
 */
export async function coverageOf(
	orders: Pick<OrderFacts, "id" | "type" | "equipmentIds" | "createdAt">[],
): Promise<Map<number, Coverage>> {
	const covered = orders.filter((order) => order.equipmentIds.length && isCoveredWork(order.type));
	const units = [...new Set(covered.flatMap((order) => order.equipmentIds))];
	if (!units.length) return new Map();

	// Coverage has no tenant of its own: it's reached through the tenant's contracts.
	const rows = await db
		.select({
			equipmentId: contractEquipment.equipmentId,
			id: contract.id,
			number: contract.number,
			level: contract.level,
			responseHours: contract.responseHours,
			startsOn: contract.startsOn,
			endsOn: contract.endsOn,
		})
		.from(contractEquipment)
		.innerJoin(...tenantJoin(contract, contractEquipment.contractId))
		.where(inList(contractEquipment.equipmentId, units));
	const byUnit = Map.groupBy(rows, (row) => row.equipmentId);

	return new Map(
		covered.flatMap((order) => {
			const own = order.equipmentIds.flatMap((unit) => byUnit.get(unit) ?? []);
			const found = coveringAllUnits(own, order.equipmentIds, order.createdAt);
			if (!found) return [];
			const { equipmentId: _equipmentId, ...coverage } = found;
			return [[order.id, coverage]];
		}),
	);
}

/**
 * The tenant's contracts that cover any of these units during `period` (both days included), as
 * one row per unit and contract, ordered by serial number. `exceptId` leaves out a contract, e.g.
 * the one being edited.
 */
export function overlappingCoverage(
	equipmentIds: number[],
	period: { startsOn: Temporal.PlainDate; endsOn: Temporal.PlainDate },
	exceptId: number | null,
) {
	return db
		.select({
			serialNumber: equipment.serialNumber,
			number: contract.number,
			endsOn: contract.endsOn,
		})
		.from(contractEquipment)
		.innerJoin(...tenantJoin(contract, contractEquipment.contractId))
		.innerJoin(...tenantJoin(equipment, contractEquipment.equipmentId))
		.where(
			and(
				inList(contractEquipment.equipmentId, equipmentIds),
				exceptId ? ne(contract.id, exceptId) : undefined,
				lte(contract.startsOn, period.endsOn),
				gte(contract.endsOn, period.startsOn),
			),
		)
		.orderBy(asc(equipment.serialNumber));
}
