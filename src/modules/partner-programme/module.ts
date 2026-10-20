import AwardIcon from "@lucide/svelte/icons/award";

import { defineModule } from "#lib/modules/define.ts";

import { partnerActions, partnerSubjects } from "./activity.ts";

export default defineModule({
	id: "partner-programme",
	label: m.partners_module_name,
	description: m.partners_module_description,
	icon: AwardIcon,
	subjects: partnerSubjects,
	actions: partnerActions,
	// Its figures are the partners' paid invoices.
	requires: ["invoices"],
	// A partner's own bonus, wallet and choice, in the customer portal.
	portal: {
		label: m.partners_portal_label,
		icon: AwardIcon,
	},
});
