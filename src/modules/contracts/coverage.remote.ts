/**
 * Data for what the contracts module adds to core pages (see `slots` in `#lib/modules/manifests.ts`): an
 * order's coverage and response time, the contracts covering a unit, and the dashboard's cards.
 */
import { error } from "@sveltejs/kit";
import { and, asc, desc, eq, gt, gte, lt, lte, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import * as v from "valibot";

import { currentDay } from "#lib/dates.ts";
import { correctiveOrderTypes } from "#lib/models.ts";
import { unitCount, withUnitIds } from "#lib/orders/server/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, equipment, order } from "#lib/server/db/schema.ts";

import { includedLabel, needsAttention, responseDeadline, waitingStatuses } from "./coverage.ts";
import { query } from "./remote-functions.ts";
import { coverageOf } from "./server/contracts.ts";
import { contract, contractEquipment } from "./server/schema.ts";

/** How far ahead the dashboard looks for contracts that end. */
const EXPIRING_DAYS = 60;

/** The contract that covered an order and its response deadline, or `null` if none did. */
export const getOrderCoverage = query(v.string(), async (number) => {
	const found = await db.query.order.findFirst({
		columns: { id: true, type: true, status: true, createdAt: true },
		where: and(eq(order.number, number), inTenant(order)),
	});
	if (!found) error(404, m.contracts_order_not_found({ number }));

	const coverage = (await coverageOf(await withUnitIds([found]))).get(found.id);
	if (!coverage) return null;
	return {
		contract: coverage,
		included: includedLabel(coverage.level),
		response: responseDeadline(found, coverage.responseHours),
	};
});

/** The contracts covering a unit, latest first. */
export const getUnitCoverage = query(v.string(), async (serialNumber) => {
	const unit = await db.query.equipment.findFirst({
		columns: { id: true },
		where: and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)),
	});
	if (!unit) error(404, m.contracts_equipment_not_found({ serial: serialNumber }));

	return db
		.select({
			id: contract.id,
			number: contract.number,
			level: contract.level,
			startsOn: contract.startsOn,
			endsOn: contract.endsOn,
			responseHours: contract.responseHours,
		})
		.from(contractEquipment)
		.innerJoin(...tenantJoin(contract, contractEquipment.contractId))
		.where(eq(contractEquipment.equipmentId, unit.id))
		.orderBy(desc(contract.startsOn));
});

/**
 * For the dashboard: covered call-outs whose response is at risk or overdue (most urgent first),
 * and active contracts that end in the coming `days` without a later contract for the customer.
 */
export const getContractsOverview = query(async () => {
	const now = Temporal.Now.instant();
	const today = currentDay();
	const horizon = today.add({ days: EXPIRING_DAYS });

	// Only breakdowns and repairs not yet scheduled can be at risk or overdue (see `coverage.ts`).
	const waiting = await withUnitIds(
		await db
			.select({
				id: order.id,
				number: order.number,
				type: order.type,
				status: order.status,
				priority: order.priority,
				createdAt: order.createdAt,
				customer: { code: customer.code, name: customer.name },
			})
			.from(order)
			.innerJoin(...tenantJoin(customer, order.customerId))
			.where(
				and(
					inTenant(order),
					inList(order.type, correctiveOrderTypes),
					inList(order.status, waitingStatuses),
					// Only orders about units can be covered.
					sql`${unitCount()} > 0`,
				),
			),
	);
	const coverage = await coverageOf(waiting);
	const responses = waiting
		.flatMap((row) => {
			const covering = coverage.get(row.id);
			const response = covering && responseDeadline(row, covering.responseHours, now);
			return covering && response && needsAttention(response.state)
				? [{ ...row, contract: covering, response }]
				: [];
		})
		.sort((a, b) => Temporal.Instant.compare(a.response.due, b.response.due));

	const later = alias(contract, "later");
	const expiring = await db
		.select({
			id: contract.id,
			number: contract.number,
			level: contract.level,
			endsOn: contract.endsOn,
			customer: { code: customer.code, name: customer.name },
		})
		.from(contract)
		.innerJoin(...tenantJoin(customer, contract.customerId))
		.where(
			and(
				inTenant(contract),
				lte(contract.startsOn, today),
				gte(contract.endsOn, today),
				lt(contract.endsOn, horizon),
				notExists(
					db
						.select({ id: later.id })
						.from(later)
						.where(
							and(
								inTenant(later),
								eq(later.customerId, contract.customerId),
								gt(later.startsOn, contract.endsOn),
							),
						),
				),
			),
		)
		.orderBy(asc(contract.endsOn), asc(contract.number));

	return { responses, expiring, days: EXPIRING_DAYS };
});
