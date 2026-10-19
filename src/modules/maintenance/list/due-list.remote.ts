/** The due list's queries and its bulk action, "Create orders" (see `bulk-actions.ts`). */
import { queryKey } from "#lib/components/data-table/list-definition.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, equipment, order } from "#lib/server/db/schema.ts";
import {
	bulkChange,
	customerRecords,
	facetOptions,
	facetOptionsInput,
	listTarget,
	planList,
	refreshRequested,
} from "#lib/server/lists/index.ts";

import { command, query } from "../remote-functions.ts";
import { dueSql, withPlanJoins } from "../server/list-sql.ts";
import { orderPlan } from "../server/orders.ts";
import { maintenancePlan } from "../server/schema.ts";
import { dueList } from "./due-list.ts";

/**
 * A page of the tenant's active plans that are due as the query's range says, with their unit,
 * customer and last order, searched and sorted as it says (see `dueList`), and how many match.
 */
export const getDuePlans = query(dueList.query, async (input) => {
	const plan = planList(dueSql(), input);
	const [rows, rowCount] = await Promise.all([
		plan.paged(
			withPlanJoins(
				db
					.select({
						id: maintenancePlan.id,
						description: maintenancePlan.description,
						orderType: maintenancePlan.orderType,
						intervalMonths: maintenancePlan.intervalMonths,
						nextDueOn: maintenancePlan.nextDueOn,
						unit: {
							id: equipment.id,
							serialNumber: equipment.serialNumber,
							manufacturer: equipment.manufacturer,
							model: equipment.model,
						},
						customer: { code: customer.code, name: customer.name },
						lastOrder: order.number,
					})
					.from(maintenancePlan)
					.$dynamic(),
			),
		),
		plan.count(),
	]);
	return {
		rows,
		rowCount,
		/** The query the rows are for (its `where` is the target of "select all matching"). */
		query: input,
		key: queryKey(input),
	};
});

/** How many plans of each order type match the search and the other filters. */
export const getDueFacets = query(dueList.where, async (where) =>
	planList(dueSql(), where).facets({ type: maintenancePlan.orderType }),
);

/**
 * The customer filter's options: customers by name or code, each with how many plans it has under
 * the list's search and other filters, most first (see `facetOptions()`); their code is the
 * filter's value.
 */
export const getDueCustomerOptions = query(facetOptionsInput(dueList), (input) =>
	facetOptions(dueSql(), input, "customer", customerRecords(), { by: customer.code }),
);

/**
 * Makes an order for each of the selected plans (or all those matching the list), each with the
 * plan moving on, in a transaction of its own: a paused plan is skipped, with the reason.
 */
export const createDueOrders = command(listTarget(dueList.where), async (target) => {
	const result = await bulkChange(target, {
		table: maintenancePlan,
		label: maintenancePlan.description,
		list: dueSql,
		change: (plan) => orderPlan(plan.id),
	});
	await refreshRequested(getDuePlans, getDueFacets);
	return result;
});
