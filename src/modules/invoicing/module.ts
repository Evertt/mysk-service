import ReceiptTextIcon from "@lucide/svelte/icons/receipt-text";

import { defineModule } from "#lib/define-module.ts";
import { m } from "#lib/paraglide/messages.js";

import { invoicingActions, invoicingSubjects } from "./activity.ts";

export default defineModule({
	id: "invoicing",
	label: m.invoices_module_name,
	description: m.invoices_module_description,
	route: "/(app)/invoices",
	icon: ReceiptTextIcon,
	slots: {
		dashboard: () => import("./dashboard-cards.svelte"),
		order: () => import("./order-invoice.svelte"),
	},
	subjects: invoicingSubjects,
	actions: invoicingActions,
	bulkActions: {
		orders: () => import("./order-bulk-actions.ts"),
	},
});
