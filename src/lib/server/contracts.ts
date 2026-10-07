/**
 * The server side of the service contracts module (see `#lib/modules.ts`): which contract covered
 * an order, and the hooks that make that count in core (see `#lib/server/modules.ts`), and that
 * offer the monthly fees for billing. The rules themselves are in
 * `#lib/components/contracts/coverage.ts` and `billing.ts`.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { contractMonths, monthlyFee } from "#lib/components/contracts/billing.js";
import {
	coveredAmount,
	coveredBy,
	coveringContract,
	includedLabel,
	isCoveredWork,
	responseDeadline,
} from "#lib/components/contracts/coverage.js";
// The module's queries, to refresh; they use `coverageOf` below in turn.
import { getOrderCoverage } from "#lib/components/contracts/coverage.remote.js";
import { formatDateTime } from "#lib/format.js";
import type { OrderTag } from "#lib/modules.js";

import { db } from "./db/index.ts";
import { contract, contractEquipment } from "./db/schema.ts";
import type { OrderFacts, ServerModule } from "./modules.ts";
import { inTenant } from "./session.ts";

/** The contract that covered an order. */
export type Coverage = Pick<
	typeof contract.$inferSelect,
	"id" | "number" | "level" | "responseHours" | "startsOn" | "endsOn"
>;

/** For each covered order (by id), the contract that covered it; see `coverage.ts`. */
export async function coverageOf(
	orders: Pick<OrderFacts, "id" | "type" | "equipmentId" | "createdAt">[],
): Promise<Map<number, Coverage>> {
	const covered = orders.filter((order) => order.equipmentId && isCoveredWork(order.type));
	const units = [...new Set(covered.map((order) => order.equipmentId!))];
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
		.innerJoin(contract, and(eq(contractEquipment.contractId, contract.id), inTenant(contract)))
		.where(inArray(contractEquipment.equipmentId, units));
	const byUnit = Map.groupBy(rows, (row) => row.equipmentId);

	return new Map(
		covered.flatMap((order) => {
			const found = coveringContract(byUnit.get(order.equipmentId!) ?? [], order.createdAt);
			if (!found) return [];
			const { equipmentId: _equipmentId, ...coverage } = found;
			return [[order.id, coverage]];
		}),
	);
}

/** The badge for a covered order whose response is at risk or overdue. */
function responseTag(order: OrderFacts, coverage: Coverage, now: Date): OrderTag | undefined {
	const deadline = responseDeadline(order, coverage.responseHours, now);
	if (!deadline) return undefined;
	const detail = `Respond by ${formatDateTime(deadline.due)} (${coverage.number})`;
	if (deadline.state === "overdue") return { label: "SLA overdue", tone: "danger", detail };
	if (deadline.state === "at_risk") return { label: "SLA at risk", tone: "warning", detail };
	return undefined;
}

export const contracts: ServerModule = {
	async adjustPrices(orders) {
		const coverage = await coverageOf(orders);
		return new Map(
			orders.flatMap((order) => {
				const covering = coverage.get(order.id);
				const amount = covering ? coveredAmount(covering.level, order) : 0;
				if (!covering || !amount) return [];
				const adjustment = {
					label: coveredBy(covering),
					detail: `${includedLabel[covering.level]} included`,
					amount: -amount,
				};
				return [[order.id, [adjustment]]];
			}),
		);
	},

	orderSaved(number) {
		void getOrderCoverage(number).refresh();
	},

	// A month's fee for each month of the customer's contracts.
	async billableItems(customerId, { from, until }) {
		const found = await db
			.select({
				id: contract.id,
				number: contract.number,
				level: contract.level,
				startsOn: contract.startsOn,
				endsOn: contract.endsOn,
				monthlyFee: contract.monthlyFee,
			})
			.from(contract)
			.where(
				and(
					eq(contract.customerId, customerId),
					inTenant(contract),
					lte(contract.startsOn, until),
					gte(contract.endsOn, from),
				),
			);
		return found.flatMap((term) =>
			contractMonths(term, from, until).map((month) => monthlyFee(term, month)),
		);
	},

	async tagOrders(orders, now) {
		const coverage = await coverageOf(orders);
		return new Map(
			orders.flatMap((order) => {
				const covering = coverage.get(order.id);
				const tag = covering && responseTag(order, covering, now);
				return tag ? [[order.id, [tag]]] : [];
			}),
		);
	},
};
