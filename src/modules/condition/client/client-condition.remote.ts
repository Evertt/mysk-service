/**
 * The condition of a customer's units as their contact reads it in the customer portal: those that
 * are critical or need attention, worst first, with their components' conditions and advice, for
 * the portal's home (`client.home`). Gated by
 * `forCustomers` and scoped to their customer and the sites they see
 * (`#lib/server/auth/customer.ts`).
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { atSites, currentCustomer, ofCustomer, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customerSite, equipment } from "#lib/server/db/schema.ts";

import { forCustomers } from "../remote-functions.ts";
import { component } from "../server/schema.ts";
import { componentSql, conditionSql } from "../server/status-sql.ts";

/** How many of them the home page lists. */
const SHOWN = 10;

/**
 * The customer's units that are critical or need attention, worst first, each with its components
 * (their conditions and advice, in their order), and how many there are.
 */
export const getClientAttention = forCustomers.query(async () => {
	const access = await currentCustomer();
	const condition = conditionSql();
	const needing = sql`${condition.status} in ('critical', 'attention')`;
	const where = and(ofCustomer(access, equipment), atSites(access, equipment.siteId), needing);
	const [units, [{ total }]] = await Promise.all([
		db
			.select({
				id: equipment.id,
				serialNumber: equipment.serialNumber,
				name: equipment.name,
				manufacturer: equipment.manufacturer,
				model: equipment.model,
				site: customerSite.name,
				status: condition.status,
				advice: condition.advice,
			})
			.from(equipment)
			.innerJoin(...tenantJoin(customerSite, equipment.siteId))
			.where(where)
			.orderBy(...condition.sort)
			.limit(SHOWN),
		db
			.select({ total: sql<number>`count(*)`.mapWith(Number) })
			.from(equipment)
			.where(where),
	]);
	const part = componentSql(condition);
	const parts = units.length
		? await db
				.select({
					id: component.id,
					equipmentId: component.equipmentId,
					number: component.number,
					name: component.name,
					score: part.score,
					band: part.band,
					advice: part.advice,
					status: part.status,
				})
				.from(component)
				.innerJoin(
					equipment,
					and(
						eq(equipment.organizationId, component.organizationId),
						eq(equipment.id, component.equipmentId),
					),
				)
				.where(
					and(
						inList(
							component.equipmentId,
							units.map((unit) => unit.id),
						),
						ofCustomer(access, equipment),
					),
				)
				.orderBy(asc(component.position), asc(component.id))
		: [];
	const byUnit = Map.groupBy(parts, (each) => each.equipmentId);
	return {
		units: units.map((unit) => ({
			...unit,
			components: (byUnit.get(unit.id) ?? []).map(({ equipmentId: _unit, ...each }) => each),
		})),
		total,
	};
});
