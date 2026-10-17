import ZapIcon from "@lucide/svelte/icons/zap";

import { defineModule } from "#lib/modules/define.ts";

import { energyActions, energySubjects } from "./activity.ts";

export default defineModule({
	id: "energy",
	label: m.energy_module_name,
	description: m.energy_module_description,
	route: "/(app)/(modules)/energy",
	settings: "/(app)/(modules)/energy/settings",
	icon: ZapIcon,
	subjects: energySubjects,
	actions: energyActions,
	// The customer's own sites' energy, read-only, in the customer portal.
	portal: {
		route: "/(customer)/(modules)/energy/portal",
		label: m.energy_portal_label,
		icon: ZapIcon,
	},
});
