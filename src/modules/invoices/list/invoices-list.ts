import {
	code,
	dateRange,
	defineList,
	moneyRange,
	oneOf,
	orNone,
} from "#lib/components/data-table/list-definition.ts";

import { invoiceStates } from "../invoice.ts";

/**
 * The invoices list: what it sorts, groups and filters by, and with which values. Loaded whole and
 * filtered in the browser (`mode: "client"`; see the review of 2026-10-20 for when it grows). Its
 * state is in the URL, e.g. `?status=overdue&due=before-today`; `?due=none` is the drafts, which
 * have no dates yet.
 */
export const invoicesList = defineList({
	mode: "client",
	columns: {
		number: { sort: true },
		customer: { sort: true, group: true, filter: code },
		status: { sort: true, group: true, filter: oneOf(invoiceStates) },
		issuedOn: { param: "issued", sort: true },
		dueOn: { param: "due", sort: true, filter: orNone(dateRange) },
		total: { sort: true, filter: moneyRange },
		credited: { sort: true },
		createdAt: { param: "created", sort: true },
	},
	defaults: { sort: [{ id: "number", desc: true }] },
});
