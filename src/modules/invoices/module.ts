import ReceiptTextIcon from "@lucide/svelte/icons/receipt-text";

import { defineModule } from "#lib/modules/define.ts";

import { invoicesActions, invoicesSubjects } from "./activity.ts";

export default defineModule({
	id: "invoices",
	label: m.invoices_module_name,
	description: m.invoices_module_description,
	icon: ReceiptTextIcon,
	subjects: invoicesSubjects,
	actions: invoicesActions,
});
