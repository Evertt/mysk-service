/**
 * The invoicing module's hook into core (see `#lib/server/modules/hooks.ts`): an order that core has
 * saved refreshes the invoice card on its page. What can be billed is in `./billable.ts`, the
 * invoices in `./invoices.ts`.
 */
import { defineServerModule } from "#lib/server/modules/hooks.ts";

import { getOrderInvoice } from "../invoicing.remote.ts";

export default defineServerModule("invoicing", {
	orders: {
		committed({ number }) {
			void getOrderInvoice(number).refresh();
		},
	},
});
