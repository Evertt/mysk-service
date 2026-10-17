import AwardIcon from "@lucide/svelte/icons/award";

import { defineModule } from "#lib/modules/define.ts";

import { partnerActions, partnerSubjects } from "./activity.ts";

export default defineModule({
	id: "partner-programme",
	label: m.partners_module_name,
	description: m.partners_module_description,
	route: "/(app)/(modules)/partner-programme",
	// Managers set each year's levels and categories there.
	settings: "/(app)/(modules)/partner-programme/years",
	icon: AwardIcon,
	subjects: partnerSubjects,
	actions: partnerActions,
	// Its figures are the partners' paid invoices.
	requires: ["invoices"],
});
