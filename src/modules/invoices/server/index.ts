/**
 * The invoices module's contribution to core (see `#lib/server/extensions.ts`): an order that core
 * has saved refreshes the invoice card on its page. What can be billed is in `./billable.ts`, the
 * invoices in `./invoices.ts`.
 */
import { committed } from "#lib/orders/extensions.ts";
import { contribute, defineServerModule } from "#lib/server/extensions.ts";

import { getOrderInvoice } from "../invoices.remote.ts";

export default defineServerModule("invoices", [
	contribute(committed, ({ number }) => {
		void getOrderInvoice(number).refresh();
	}),
]);
