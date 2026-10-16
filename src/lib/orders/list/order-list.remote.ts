import { queryKey } from "#lib/components/data-table/list-definition.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { pageGroupsOf, planList } from "#lib/server/lists/index.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { tagOrders } from "../server/hooks.ts";
import { ordersSql, withOrderJoins } from "../server/list-sql.ts";
import { priceOrders } from "../server/pricing.ts";
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
						equipment: {
							id: equipment.id,
							name: equipment.name,
							model: equipment.model,
							manufacturer: equipment.manufacturer,
							serialNumber: equipment.serialNumber,
						},
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
	const facts = rows.map((row) => ({
		...row,
		equipmentId: row.equipment?.id ?? null,
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
 * How many orders have each type, status, priority, engineer (by id) and unit (by serial number),
 * for the counts in the list's filters: of those matching the search and the other filters. The
 * unassigned orders and the new installations count under `none`.
 */
export const getOrderFacets = forMembers.query(ordersList.where, async (where) => {
	return planList(ordersSql(), where).facets({
		type: order.type,
		status: order.status,
		priority: order.priority,
		engineer: order.engineerId,
		equipment: equipment.serialNumber,
	});
});
