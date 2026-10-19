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
	// Announced with each batch of meter readings, for the live pages; never logged.
	liveTypes: ["energy_reading"],
	actions: energyActions,
	// The orders an alert is made into: a repair of its door's unit, else a survey (`server/alerts.ts`).
	orderTypes: ["repair", "survey"],
	// The customer's own sites' energy, read-only, in the customer portal.
	portal: {
		route: "/(customer)/(modules)/energy/portal",
		label: m.energy_portal_label,
		icon: ZapIcon,
	},
});
