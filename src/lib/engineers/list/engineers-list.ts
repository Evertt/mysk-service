import {
	code,
	dateRange,
	defineList,
	moneyRange,
	numberRange,
	oneOf,
} from "#lib/components/data-table/list-definition.ts";
import { engineerSpecialties } from "#lib/models.ts";

/** Whether an engineer takes work: the status filter's values. */
export const engineerStates = ["active", "inactive"] as const;

/**
 * The engineers list: what it sorts, groups and filters by, and with which values. A small list,
 * loaded whole and filtered in the browser (`mode: "client"`). Its state is in the URL, e.g.
 * `?specialty=hvac&status=active&rate=..60`.
 */
export const engineersList = defineList({
	mode: "client",
	columns: {
		name: { sort: true },
		// What the search finds them by besides.
		email: {},
		specialty: { sort: true, group: true, filter: oneOf(engineerSpecialties) },
		// Free text: any region.
		region: { sort: true, group: true, filter: code },
		status: { sort: true, group: true, filter: oneOf(engineerStates) },
		hourlyRate: { param: "rate", sort: true, filter: moneyRange },
		openOrders: { param: "open-orders", sort: true, filter: numberRange },
		hiredAt: { param: "hired", sort: true, filter: dateRange },
	},
	defaults: { sort: [{ id: "name", desc: false }] },
});
