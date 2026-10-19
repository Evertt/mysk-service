import GaugeIcon from "@lucide/svelte/icons/gauge";

import { defineModule } from "#lib/modules/define.ts";

import { conditionActions, conditionSubjects } from "./activity.ts";

export default defineModule({
	id: "condition",
	label: m.condition_module_name,
	description: m.condition_module_description,
	route: "/(app)/(modules)/condition",
	settings: "/(app)/(modules)/condition/settings",
	icon: GaugeIcon,
	subjects: conditionSubjects,
	actions: conditionActions,
	// Asks for a unit's condition on the engineer portal's checklist, once it's completed.
	enhances: ["checklists"],
	// The orders it makes by itself, for a unit whose condition calls for it (`server/automatic.ts`).
	orderTypes: ["maintenance"],
	nav: { after: "equipment" },
});
