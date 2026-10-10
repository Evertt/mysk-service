import ReceiptTextIcon from "@lucide/svelte/icons/receipt-text";

import { defineModule } from "#lib/modules/define.ts";

import { invoicingActions, invoicingSubjects } from "./activity.ts";

export default defineModule({
	id: "invoicing",
	label: m.invoices_module_name,
	description: m.invoices_module_description,
	route: "/(app)/(modules)/invoices",
	icon: ReceiptTextIcon,
	subjects: invoicingSubjects,
	actions: invoicingActions,
});
