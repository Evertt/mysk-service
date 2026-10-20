import { code, defineList, oneOf } from "#lib/components/data-table/list-definition.ts";

import { creditNoteStates, creditSettlements } from "../credit-note.ts";

/**
 * The credit notes list: what it sorts, groups and filters by, and with which values. Loaded whole
 * and filtered in the browser (`mode: "client"`). Its state is in the URL, e.g.
 * `?status=sent&settlement=refund` (the dashboard links to the ones to refund).
 */
export const creditNotesList = defineList({
	mode: "client",
	columns: {
		number: { sort: true },
		customer: { sort: true, group: true, filter: code },
		invoice: { sort: true },
		reason: { sort: true },
		status: { sort: true, group: true, filter: oneOf(creditNoteStates) },
		settlement: { sort: true, filter: oneOf(creditSettlements) },
		issuedOn: { param: "issued", sort: true },
		total: { sort: true },
		createdAt: { param: "created", sort: true },
	},
	defaults: { sort: [{ id: "number", desc: true }] },
});
