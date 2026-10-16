import { queryKey } from "#lib/components/data-table/list-definition.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { pageGroupsOf, planList } from "#lib/server/lists/index.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { tagOrders } from "../server/hooks.ts";
import { ordersSql, unitFacets, withOrderJoins } from "../server/list-sql.ts";
import { priceOrders } from "../server/pricing.ts";
import { unitCount, withUnitIds } from "../server/units.ts";
import { ordersList } from "./orders-list.ts";

/**
 * A page of the orders list with their customer, equipment, engineer and totals, searched,
 * filtered, sorted and grouped as the query says (see `ordersList`), how many orders match in all,
 * and, when grouped, what the table needs to know of the page's groups.
 */
export const getOrders = forMembers.query(ordersList.query, async (input) => {
	const plan = planList(ordersSql(), input);
	const [rows, rowCount, counts] = await Promise.all([
		plan.paged(
			withOrderJoins(
				db
					.select({
						id: order.id,
						number: order.number,
						type: order.type,
						status: order.status,
						priority: order.priority,
						description: order.description,
						scheduledFor: order.scheduledFor,
						completedAt: order.completedAt,
						createdAt: order.createdAt,
						laborHours: order.laborHours,
						customer: { id: customer.id, code: customer.code, name: customer.name },
						/** The first of its units, if it has any. */
						equipment: {
							id: equipment.id,
							name: equipment.name,
							model: equipment.model,
							manufacturer: equipment.manufacturer,
							serialNumber: equipment.serialNumber,
						},
						/** How many units it's about, the first one included. */
						unitCount: unitCount(),
						engineer: { id: engineer.id, name: engineer.name, hourlyRate: engineer.hourlyRate },
					})
					.from(order)
					.$dynamic(),
			),
		),
		plan.count(),
		plan.groupCounts(),
	]);

	// The page's orders (only, with the rows around it when grouped) priced and tagged.
	const facts = (await withUnitIds(rows)).map((row) => ({
		...row,
		hourlyRate: row.engineer?.hourlyRate,
	}));
	const [prices, tags] = await Promise.all([priceOrders(facts), tagOrders(facts)]);
	const priced = plan.page(
		rows.map((row, i) => ({
			...row,
			laborTotal: prices[i].labor,
			total: prices[i].total,
			/** From the tenant's modules, e.g. a response time about to be missed. */
			tags: tags[i],
		})),
	);
	return {
		rows: priced.rows,
		rowCount,
		/** The query the rows are for (its `where` is the target of "select all matching"). */
		query: input,
		/** The same as a string, to tell whether the table is waiting for other rows (`isStale`). */
		key: queryKey(input),
		groups: pageGroupsOf(counts, priced),
	};
});

/**
 * How many orders have each type, status, priority, engineer (by id) and unit (by serial number;
 * an order counts for each of its units), for the counts in the list's filters: of those matching
 * the search and the other filters. The unassigned orders and the new installations count under
 * `none`.
 */
export const getOrderFacets = forMembers.query(ordersList.where, async (where) => {
	const plan = planList(ordersSql(), where);
	const [facets, equipment] = await Promise.all([
		plan.facets({
			type: order.type,
			status: order.status,
			priority: order.priority,
			engineer: order.engineerId,
		}),
		unitFacets(plan),
	]);
	return { ...facets, equipment };
});
