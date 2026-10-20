import CalendarSyncIcon from "@lucide/svelte/icons/calendar-sync";

import { defineModule } from "#lib/modules/define.ts";

import { maintenanceSubjects } from "./activity.ts";

export default defineModule({
	id: "maintenance",
	label: m.maintenance_module_name,
	description: m.maintenance_module_description,
	route: "/(app)/(modules)/maintenance",
	settings: "/(app)/(modules)/maintenance/settings",
	icon: CalendarSyncIcon,
	subjects: maintenanceSubjects,
	// Adds the plans of a contract's covered units to its page, when the tenant has contracts, and
	// a unit's next visit to the condition module's units.
	enhances: ["contracts", "condition"],
	nav: { after: "equipment" },
	// The orders its plans make (`planOrderTypes`).
	orderTypes: ["maintenance", "inspection"],
});
